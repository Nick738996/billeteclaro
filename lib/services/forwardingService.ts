import { randomBytes, createHash } from 'crypto'
import { detectBank } from '@/lib/email/bankSenders'
import { cleanForwardedBody } from '@/lib/utils/cleanForwardedBody'
import { extractTransaction } from '@/lib/services/emailPipeline'
import { deduplicateUber, matchUberAgainstPersisted } from '@/lib/utils/deduplicateUber'
import { generateAuditId } from '@/lib/utils/auditId'
import { reassignCalendarMonths } from '@/lib/services/mesContableService'
import { toColombiaDate } from '@/lib/utils/mesContable'
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
// Probado en vivo: un GET servidor-a-servidor al link de confirmación
// devuelve 200 pero Google NO lo cuenta como confirmación real (el reenvío
// sigue en "Verificar" en la configuración de Gmail) — necesita una visita
// real de navegador. Por eso no confiamos en el resultado del fetch: solo lo
// intentamos como best-effort, y siempre guardamos el link para que el
// wizard lo abra en el navegador del usuario (ver ForwardingWizard.tsx) o el
// usuario confirme manualmente que ya lo verificó (POST /api/forwarding/confirm).
const CONFIRMATION_SENDER_RE = /forwarding-noreply@google\.com|no-?reply@.*outlook\.com|postmaster@.*microsoft\.com/i
const CONFIRMATION_LINK_RE = /https?:\/\/[^\s"'<>]*\/mail\/vf-[^\s"'<>]+/i

async function tryAutoConfirm(admin: Admin, userId: string, body: string): Promise<boolean> {
  const match = body.match(CONFIRMATION_LINK_RE)
  if (!match) return false
  const confirmUrl = match[0]

  try {
    await fetch(confirmUrl, { method: 'GET' })
  } catch (err) {
    console.error('[forwardingService] auto-confirm fetch falló (no bloqueante):', err)
  }

  await admin.from('forwarding_addresses').update({ pending_confirm_url: confirmUrl }).eq('user_id', userId)
  return false
}

// El reenvío llega sin el remitente bancario en el header `From` (ese ahora
// es quien reenvió) — buscamos las líneas "De:"/"From:" de los bloques de
// reenvío citados para recuperar el remitente original y poder usar
// detectBank(). Un correo puede reenviarse más de una vez (alguien le
// reenvía al usuario un correo que ya venía reenviado) — la primera línea
// "De:" encontrada es la del reenvío más reciente, no necesariamente la del
// banco, así que se prueban todas y se usa la primera que resuelva a un
// banco conocido.
function detectBankFromForwardedBody(body: string): Banco {
  for (const match of body.matchAll(/^(?:De|From):\s*(.+)$/gim)) {
    const banco = detectBank(match[1])
    if (banco !== 'OTRO') return banco
  }
  return 'OTRO'
}

export interface ProcessResult {
  processed: boolean
  reason: string
  debug?: string
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
    body: cleanForwardedBody(payload.body),
    provider: 'forwarded',
    authenticated: true,
  }

  const debug = `banco=${banco} senderLines=${JSON.stringify([...payload.body.matchAll(/^(?:De|From):\s*(.+)$/gim)].map(m => m[1]))} body(0-800)=${email.body.slice(0, 800)}`

  const extracted = await extractTransaction(email, banco)
  if (!extracted) return { processed: false, reason: 'extraction_failed', debug }

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
      await reassignCalendarMonths(admin, userId, [toColombiaDate(fecha.toISOString()).slice(0, 7)])
    }
    return { processed: match.updatePersisted, reason: match.updatePersisted ? 'uber_cross_match_updated' : 'uber_preauth_late' }
  }

  if (remaining.length === 0) return { processed: false, reason: 'uber_dedup' }

  const fecha = extracted.fecha ? new Date(extracted.fecha) : new Date()

  // Reenviar el mismo correo original dos veces (a mano, o porque el
  // usuario recuperó una transacción borrada reenviándola de nuevo) produce
  // dos correos con Message-ID distinto — el `onConflict` de más abajo no
  // los detecta como duplicados porque el id es distinto. Acá comparamos
  // por contenido (mismo banco/tipo/monto/fecha exacta) antes de insertar.
  const { data: possibleDup } = await admin
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('banco', extracted.banco)
    .eq('tipo', extracted.tipo)
    .eq('monto', extracted.monto)
    .eq('fecha', fecha.toISOString())
    .maybeSingle()
  if (possibleDup) return { processed: false, reason: 'duplicate_content' }
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

  await reassignCalendarMonths(admin, userId, [toColombiaDate(fecha.toISOString()).slice(0, 7)])
  return { processed: true, reason: 'inserted', debug }
}
