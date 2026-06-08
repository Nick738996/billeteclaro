import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  refreshGmailToken,
  buildGmailClient,
  listBankMessageIds,
  getMessageDetails,
} from '@/lib/gmail/client'
import { trySpecificParser } from '@/lib/parsers'
import { extractWithGroq } from '@/lib/ai/extractor'
import type { ExtractedTransaction } from '@/lib/types'
import { format } from 'date-fns'

const MAX_EMAILS_PER_SYNC = 2000
const FETCH_BATCH_SIZE = 10
const GROQ_CONCURRENCY = 3

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Get stored Gmail tokens
  const { data: tokenRow } = await admin
    .from('user_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!tokenRow?.gmail_refresh_token) {
    return NextResponse.json(
      { error: 'No Gmail token found. Please reconnect your Google account.' },
      { status: 400 }
    )
  }

  // Start sync log
  const { data: syncLog } = await admin
    .from('sync_log')
    .insert({ user_id: user.id, status: 'RUNNING' })
    .select('id')
    .single()

  const syncId = syncLog?.id

  try {
    // Refresh access token
    const { access_token, expires_at } = await refreshGmailToken(
      tokenRow.gmail_refresh_token
    )

    // Update stored token
    await admin.from('user_tokens').update({
      gmail_access_token: access_token,
      token_expires_at: expires_at.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id)

    const gmail = buildGmailClient(access_token)

    // Search 1 year back to ensure full history on first sync
    const allMessageIds = await listBankMessageIds(gmail)

    // Find which ones we haven't processed yet
    const { data: existing } = await admin
      .from('transactions')
      .select('gmail_message_id')
      .eq('user_id', user.id)
      .in('gmail_message_id', allMessageIds)

    const processedIds = new Set((existing ?? []).map((r) => r.gmail_message_id))
    const newIds = allMessageIds
      .filter((id) => !processedIds.has(id))
      .slice(0, MAX_EMAILS_PER_SYNC)

    let transaccionesNuevas = 0
    const errores: string[] = []

    for (let i = 0; i < newIds.length; i += FETCH_BATCH_SIZE) {
      const batch = newIds.slice(i, i + FETCH_BATCH_SIZE)

      const emailDetails = await Promise.allSettled(
        batch.map((id) => getMessageDetails(gmail, id))
      )

      // Separate emails that need Groq from those handled by specific parsers
      const needsGroq: typeof emailDetails[number][] = []
      const transactions: Array<{ id: string; extracted: ExtractedTransaction }> = []

      for (const result of emailDetails) {
        if (result.status === 'rejected') {
          errores.push(`Fetch error: ${result.reason}`)
          continue
        }

        const email = result.value
        const parsed = trySpecificParser(email.banco, {
          id: email.id,
          from: email.from,
          subject: email.subject,
          date: email.date,
          body: email.body,
        })

        if (parsed) {
          transactions.push({ id: email.id, extracted: { ...parsed, banco: email.banco } })
        } else {
          needsGroq.push(result)
        }
      }

      // Groq fallback for any email the specific parser couldn't handle
      for (let j = 0; j < needsGroq.length; j += GROQ_CONCURRENCY) {
        const groqBatch = needsGroq.slice(j, j + GROQ_CONCURRENCY)
        const groqResults = await Promise.allSettled(
          groqBatch.map((r) => {
            if (r.status === 'rejected') return Promise.resolve(null)
            const email = r.value
            return extractWithGroq({
              from: email.from,
              subject: email.subject,
              date: email.date,
              body: email.body,
              banco: email.banco,
            }).then((extracted) => extracted ? { id: email.id, extracted: { ...extracted, banco: email.banco } } : null)
          })
        )

        for (const res of groqResults) {
          if (res.status === 'fulfilled' && res.value) {
            transactions.push(res.value)
          } else if (res.status === 'rejected') {
            errores.push(`Groq error: ${res.reason}`)
          }
        }
      }

      // Build rows for insertion
      if (transactions.length > 0) {
        const rows = await Promise.all(
          transactions.map(async ({ id, extracted }) => {
            const fecha = extracted.fecha ? new Date(extracted.fecha) : new Date()
            const idAuditoria = await generateAuditId(admin, user.id, fecha)

            return {
              user_id: user.id,
              gmail_message_id: id,
              fecha: fecha.toISOString(),
              monto: extracted.monto,
              comercio: extracted.comercio,
              descripcion: extracted.descripcion,
              banco: extracted.banco,
              tipo: extracted.tipo,
              categoria: extracted.categoria,
              subcategoria: extracted.subcategoria,
              id_auditoria: idAuditoria,
              moneda: extracted.moneda,
              monto_usd: extracted.monto_usd,
              flags: extracted.flags,
              raw_snippet: null,
              procesado: true,
            }
          })
        )

        // Upsert — ignore duplicates via unique constraint
        const { error: insertError, data: inserted } = await admin
          .from('transactions')
          .upsert(rows, { onConflict: 'user_id,gmail_message_id', ignoreDuplicates: true })
          .select('id')

        if (insertError) {
          errores.push(`Insert error: ${insertError.message}`)
        } else {
          transaccionesNuevas += inserted?.length ?? 0
        }
      }
    }

    // Update sync log
    await admin.from('sync_log').update({
      finished_at: new Date().toISOString(),
      correos_revisados: newIds.length,
      transacciones_nuevas: transaccionesNuevas,
      errores,
      status: errores.length > 0 && transaccionesNuevas === 0 ? 'ERROR' : 'DONE',
    }).eq('id', syncId)

    return NextResponse.json({
      correos_revisados: newIds.length,
      transacciones_nuevas: transaccionesNuevas,
      errores,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Sync error:', err)

    await admin.from('sync_log').update({
      finished_at: new Date().toISOString(),
      errores: [message],
      status: 'ERROR',
    }).eq('id', syncId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function generateAuditId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  fecha: Date
): Promise<string> {
  const dayStart = new Date(fecha)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(fecha)
  dayEnd.setHours(23, 59, 59, 999)

  const { count } = await admin
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('fecha', dayStart.toISOString())
    .lte('fecha', dayEnd.toISOString())

  const seq = ((count ?? 0) + 1).toString().padStart(2, '0')
  const mmdd = format(fecha, 'MMdd')
  return `${mmdd}-${seq}`
}
