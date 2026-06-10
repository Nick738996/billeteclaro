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

    const allMessageIds = await listBankMessageIds(gmail)

    // Traer TODOS los IDs ya procesados del usuario (sin .in() para evitar límite de URL)
    const { data: existing } = await admin
      .from('transactions')
      .select('gmail_message_id')
      .eq('user_id', user.id)

    const processedIds = new Set((existing ?? []).map((r) => r.gmail_message_id))

    // Agregar IDs ignorados en syncs anteriores (pre-auths de Uber, etc.)
    const { data: pastLogs } = await admin
      .from('sync_log')
      .select('skipped_ids')
      .eq('user_id', user.id)

    for (const log of pastLogs ?? []) {
      for (const id of (log.skipped_ids ?? []) as string[]) {
        processedIds.add(id)
      }
    }
    const newIds = allMessageIds
      .filter((id) => !processedIds.has(id))
      .slice(0, MAX_EMAILS_PER_SYNC)

    const errores: string[] = []
    let parserCount = 0
    let groqCount = 0
    let omitidosCount = 0

    // FASE 1 — Recolectar todas las transacciones de todos los batches
    const allTransactions: Array<{ id: string; extracted: ExtractedTransaction }> = []

    for (let i = 0; i < newIds.length; i += FETCH_BATCH_SIZE) {
      const batch = newIds.slice(i, i + FETCH_BATCH_SIZE)

      const emailDetails = await Promise.allSettled(
        batch.map((id) => getMessageDetails(gmail, id))
      )

      const needsGroq: typeof emailDetails[number][] = []

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
          parserCount++
          allTransactions.push({ id: email.id, extracted: { ...parsed, banco: email.banco } })
        } else {
          needsGroq.push(result)
        }
      }

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
            }).then((extracted) =>
              extracted ? { id: email.id, extracted: { ...extracted, banco: email.banco } } : null
            )
          })
        )

        for (const res of groqResults) {
          if (res.status === 'fulfilled' && res.value) {
            groqCount++
            allTransactions.push(res.value)
          } else if (res.status === 'fulfilled' && res.value === null) {
            omitidosCount++
          } else if (res.status === 'rejected') {
            errores.push(`Groq error: ${res.reason}`)
          }
        }
      }
    }

    // FASE 2 — Dedup Uber sobre TODAS las transacciones (no por batch)
    const { transactions: dedupedTransactions, preauthIds } = deduplicateUber(allTransactions)

    // FASE 3 — Insertar
    let transaccionesNuevas = 0

    if (dedupedTransactions.length > 0) {
      const rows = await Promise.all(
        dedupedTransactions.map(async ({ id, extracted }) => {
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

    console.log(
      `[sync] ${newIds.length} emails — ` +
      `${parserCount} parser | ${groqCount} Groq | ${omitidosCount} omitidos | ${preauthIds.length} Uber preauth | ${errores.length} errores`
    )

    // Update sync log — guardar pre-auth IDs para no reprocessarlos en futuros syncs
    await admin.from('sync_log').update({
      finished_at: new Date().toISOString(),
      correos_revisados: newIds.length,
      transacciones_nuevas: transaccionesNuevas,
      errores,
      skipped_ids: preauthIds,
      status: errores.length > 0 && transaccionesNuevas === 0 ? 'ERROR' : 'DONE',
    }).eq('id', syncId)

    return NextResponse.json({
      correos_revisados: newIds.length,
      transacciones_nuevas: transaccionesNuevas,
      parser: parserCount,
      groq: groqCount,
      omitidos: omitidosCount,
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

function deduplicateUber(txs: Array<{ id: string; extracted: ExtractedTransaction }>): {
  transactions: Array<{ id: string; extracted: ExtractedTransaction }>
  preauthIds: string[]
} {
  const uberTxs = txs.filter(t => t.extracted.comercio?.toLowerCase().includes('uber'))

  if (uberTxs.length < 2) return { transactions: txs, preauthIds: [] }

  const preauthIds = new Set<string>()

  for (let i = 0; i < uberTxs.length; i++) {
    if (preauthIds.has(uberTxs[i].id)) continue
    for (let j = i + 1; j < uberTxs.length; j++) {
      if (preauthIds.has(uberTxs[j].id)) continue

      const timeA = new Date(uberTxs[i].extracted.fecha ?? '').getTime()
      const timeB = new Date(uberTxs[j].extracted.fecha ?? '').getTime()
      const diffHours = Math.abs(timeA - timeB) / 3_600_000

      if (diffHours <= 2) {
        const amountA = uberTxs[i].extracted.monto
        const amountB = uberTxs[j].extracted.monto
        const pctDiff = Math.abs(amountA - amountB) / Math.max(amountA, amountB)

        if (pctDiff <= 0.2) {
          preauthIds.add(timeA <= timeB ? uberTxs[i].id : uberTxs[j].id)
        }
      }
    }
  }

  return {
    transactions: txs.filter(t => !preauthIds.has(t.id)),
    preauthIds: [...preauthIds],
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
