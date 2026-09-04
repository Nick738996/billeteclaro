import { randomBytes, createHash } from 'crypto'
import { detectBank } from '@/lib/email/gmail'
import { extractTransaction } from '@/lib/services/emailPipeline'
import { deduplicateUber, matchUberAgainstPersisted } from '@/lib/utils/deduplicateUber'
import { generateAuditId } from '@/lib/utils/auditId'
import { reassignCalendarMonths } from '@/lib/services/mesContableService'
import { createAdminClient } from '@/lib/supabase/server'
import type { EmailMessage } from '@/lib/email/types'
import type { Banco } from '@/lib/types'

type Admin = ReturnType<typeof createAdminClient>

export interface ForwardedEmailPayload {
  /** Local-part de la dirección de reenvío (antes del @), incluye el prefijo `u_` */
  token: string
  /** Quién reenvió el correo (la cuenta del usuario, o Google/Outlook si es la confirmación) */
  from: string
  subject: string
  date: string
  body: string
  messageId?: string | null
}

function generateForwardingToken(): string {
  return `u_${randomBytes(6).toString('hex')}`
}

export async function getOrCreateForwardingAddress(admin: Admin, userId: string) {
  const { data: existing } = await admin
    .from('forwarding_addresses')
    .select('token, confirmed_at, pending_confirm_url')
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) return existing

  const token = generateForwardingToken()
  const { data, error } = await admin
    .from('forwarding_addresses')
    .insert({ user_id: userId, token })
    .select('token, confirmed_at, pending_confirm_url')
    .single()
  if (error) throw error
  return data
}

// ── Confirmación de reenvío (Gmail/Outlook) ─────────────────────────────────
// No hay callback de éxito para el link de confirmación — tratamos el envío
// exitoso del GET como confirmación (mismo comportamiento observado en
// Finvot: "Reenvío confirmado" aparece casi inmediatamente tras agregar la
// dirección). Si el fetch falla, el link queda guardado para que el wizard
// ofrezca un botón de confirmación manual.
const CONFIRMATION_SENDER_RE = /forwarding-noreply@google\.com|no-?reply@.*outlook\.com|postmaster@.*microsoft\.com/i
const CONFIRMATION_LINK_RE = /https?:\/\/[^\s"'<>]*\/mail\/vf-[^\s"'<>]+/i

async function tryAutoConfirm(admin: Admin, userId: string, body: string): Promise<boolean> {
  const match = body.match(CONFIRMATION_LINK_RE)
  if (!match) {
    // DEBUG temporal — guarda un fragmento del cuerpo real para ajustar el
    // regex del link de confirmación. Quitar una vez confirmado el formato.
    await admin.from('forwarding_addresses')
      .update({ pending_confirm_url: `DEBUG_NO_MATCH: ${body.slice(0, 800)}` })
      .eq('user_id', userId)
    return false
  }
  const confirmUrl = match[0]

  try {
    const res = await fetch(confirmUrl, { method: 'GET' })
    if (res.ok) {
      await admin.from('forwarding_addresses')
        .update({ confirmed_at: new Date().toISOString(), pending_confirm_url: null })
        .eq('user_id', userId)
      return true
    }
  } catch (err) {
    console.error('[forwardingService] auto-confirm fetch falló:', err)
  }

  await admin.from('forwarding_addresses').update({ pending_confirm_url: confirmUrl }).eq('user_id', userId)
  return false
}

// El reenvío llega sin el remitente bancario en el header `From` (ese ahora
// es quien reenvió) — buscamos una línea "De:"/"From:" del bloque de reenvío
// citado para recuperar el remitente original y poder usar detectBank().
function detectBankFromForwardedBody(body: string): Banco {
  const match = body.match(/^(?:De|From):\s*(.+)$/im)
  if (!match) return 'OTRO'
  return detectBank(match[1])
}

export interface ProcessResult {
  processed: boolean
  reason: string
}

export async function processForwardedEmail(payload: ForwardedEmailPayload, admin: Admin): Promise<ProcessResult> {
  const { data: addr } = await admin
    .from('forwarding_addresses')
    .select('user_id, confirmed_at')
    .eq('token', payload.token)
    .maybeSingle()

  if (!addr) {
    console.warn(`[forwardingService] token desconocido: ${payload.token}`)
    return { processed: false, reason: 'unknown_token' }
  }

  if (CONFIRMATION_SENDER_RE.test(payload.from)) {
    const confirmed = await tryAutoConfirm(admin, addr.user_id, payload.body)
    return { processed: false, reason: confirmed ? 'auto_confirmed' : 'confirmation_pending' }
  }

  if (!addr.confirmed_at) {
    console.warn(`[forwardingService] dirección aún no confirmada — correo descartado (user=${addr.user_id})`)
    return { processed: false, reason: 'not_confirmed' }
  }

  const userId = addr.user_id
  const banco = detectBankFromForwardedBody(payload.body)

  const email: EmailMessage = {
    id: payload.messageId || `fwd:${createHash('sha256').update(payload.body).digest('hex')}`,
    from: payload.from,
    subject: payload.subject,
    date: payload.date,
    body: payload.body,
    provider: 'forwarded',
    authenticated: true,
  }

  const extracted = await extractTransaction(email, banco)
  if (!extracted) return { processed: false, reason: 'extraction_failed' }

  // Dedup de Uber (pre-auth vs. cobro final) contra el historial ya persistido
  // — mismo patrón que syncService.ts FASE 2, pero para un solo item.
  const item = { id: email.id, extracted }
  const { transactions: afterInBatch } = deduplicateUber([item])
  if (afterInBatch.length === 0) return { processed: false, reason: 'uber_preauth' }

  const { data: persistedUber } = await admin
    .from('transactions')
    .select('id, fecha, monto')
    .eq('user_id', userId)
    .ilike('comercio', '%uber%')

  const { remaining, matches } = matchUberAgainstPersisted(
    [item],
    (persistedUber ?? []).map(t => ({ id: t.id, fecha: t.fecha, monto: t.monto }))
  )

  if (matches.length > 0) {
    const match = matches[0]
    if (match.updatePersisted) {
      const fecha = extracted.fecha ? new Date(extracted.fecha) : new Date()
      await admin.from('transactions').update({
        monto: extracted.monto, fecha: fecha.toISOString(),
        descripcion: extracted.descripcion, flags: extracted.flags,
      }).eq('id', match.persistedId)
      await reassignCalendarMonths(admin, userId, [fecha.toISOString().slice(0, 7)])
    }
    return { processed: match.updatePersisted, reason: match.updatePersisted ? 'uber_cross_match_updated' : 'uber_preauth_late' }
  }

  if (remaining.length === 0) return { processed: false, reason: 'uber_dedup' }

  const fecha = extracted.fecha ? new Date(extracted.fecha) : new Date()
  const { error: insertError, data: inserted } = await admin
    .from('transactions')
    .upsert({
      user_id: userId, gmail_message_id: email.id,
      fecha: fecha.toISOString(), monto: extracted.monto,
      comercio: extracted.comercio, descripcion: extracted.descripcion,
      banco: extracted.banco, tipo: extracted.tipo,
      categoria: extracted.categoria, subcategoria: extracted.subcategoria,
      id_auditoria: await generateAuditId(admin, userId, fecha),
      moneda: extracted.moneda, monto_usd: extracted.monto_usd,
      flags: extracted.flags, raw_snippet: null, procesado: true,
      contraparte_id: extracted.contraparte_id ?? null,
    }, { onConflict: 'user_id,gmail_message_id', ignoreDuplicates: true })
    .select('id')

  if (insertError) {
    console.error('[forwardingService] insert error:', insertError.message)
    return { processed: false, reason: 'insert_error' }
  }
  if (!inserted || inserted.length === 0) return { processed: false, reason: 'already_processed' }

  await reassignCalendarMonths(admin, userId, [fecha.toISOString().slice(0, 7)])
  return { processed: true, reason: 'inserted' }
}
