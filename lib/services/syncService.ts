import {
  refreshGmailToken,
  buildGmailClient,
  listBankMessageIds,
  getMessageDetails,
} from '@/lib/gmail/client'
import { trySpecificParser } from '@/lib/parsers'
import { generateAuditId } from '@/lib/utils/auditId'
import { asignarMesContable } from '@/lib/utils/mesContable'
import { deduplicateUber } from '@/lib/utils/deduplicateUber'
import { createAdminClient } from '@/lib/supabase/server'
import type { ExtractedTransaction } from '@/lib/types'

type Admin = ReturnType<typeof createAdminClient>

const MAX_EMAILS  = 2000
const BATCH_SIZE  = 10

export interface SyncResult {
  correos_revisados:    number
  transacciones_nuevas: number
  parser:   number
  omitidos: number
  errores:  string[]
}

export async function runSync(userId: string, admin: Admin): Promise<SyncResult> {
  // 1. Gmail tokens
  const { data: tokenRow } = await admin
    .from('user_tokens').select('*').eq('user_id', userId).single()

  if (!tokenRow?.gmail_refresh_token) {
    throw Object.assign(new Error('No Gmail token found. Please reconnect your Google account.'), { status: 400 })
  }

  // 2. Sync log
  const { data: syncLog } = await admin
    .from('sync_log')
    .insert({ user_id: userId, status: 'RUNNING' })
    .select('id')
    .single()
  const syncId = syncLog?.id

  try {
    // 3. Refresh access token
    const { access_token, expires_at } = await refreshGmailToken(tokenRow.gmail_refresh_token)
    await admin.from('user_tokens').update({
      gmail_access_token: access_token,
      token_expires_at:   expires_at.toISOString(),
      updated_at:         new Date().toISOString(),
    }).eq('user_id', userId)

    const gmail = buildGmailClient(access_token)

    // 4. IDs ya procesados (transactions + todos los skipped_ids de sync_log)
    const [{ data: existing }, { data: pastLogs }, allMessageIds] = await Promise.all([
      admin.from('transactions').select('gmail_message_id').eq('user_id', userId),
      admin.from('sync_log').select('skipped_ids').eq('user_id', userId),
      listBankMessageIds(gmail),
    ])

    const processedIds = new Set((existing ?? []).map(r => r.gmail_message_id))
    for (const log of pastLogs ?? []) {
      for (const id of (log.skipped_ids ?? []) as string[]) processedIds.add(id)
    }

    const newIds = allMessageIds.filter(id => !processedIds.has(id)).slice(0, MAX_EMAILS)

    const errores: string[] = []
    let parserCount = 0, omitidosCount = 0
    const allTransactions: Array<{ id: string; extracted: ExtractedTransaction }> = []

    // 5. FASE 1 — parsers específicos (sin fallback IA)
    for (let i = 0; i < newIds.length; i += BATCH_SIZE) {
      const batch = newIds.slice(i, i + BATCH_SIZE)
      const emailDetails = await Promise.allSettled(batch.map(id => getMessageDetails(gmail, id)))

      for (const result of emailDetails) {
        if (result.status === 'rejected') { errores.push(`Fetch error: ${result.reason}`); continue }
        const email = result.value
        const parsed = trySpecificParser(email.banco, { id: email.id, from: email.from, subject: email.subject, date: email.date, body: email.body })
        if (parsed) {
          parserCount++
          allTransactions.push({ id: email.id, extracted: { ...parsed, banco: email.banco } })
        } else {
          omitidosCount++
        }
      }
    }

    // 6. FASE 2 — dedup Uber (ver lib/utils/deduplicateUber.ts)
    const { transactions: deduped, preauthIds } = deduplicateUber(allTransactions)

    // 7. FASE 3 — insertar
    let transaccionesNuevas = 0
    if (deduped.length > 0) {
      const rows = await Promise.all(
        deduped.map(async ({ id, extracted }) => {
          const fecha = extracted.fecha ? new Date(extracted.fecha) : new Date()
          return {
            user_id: userId, gmail_message_id: id,
            fecha: fecha.toISOString(), monto: extracted.monto,
            comercio: extracted.comercio, descripcion: extracted.descripcion,
            banco: extracted.banco, tipo: extracted.tipo,
            categoria: extracted.categoria, subcategoria: extracted.subcategoria,
            id_auditoria: await generateAuditId(admin, userId, fecha),
            moneda: extracted.moneda, monto_usd: extracted.monto_usd,
            flags: extracted.flags, raw_snippet: null, procesado: true,
          }
        })
      )
      const { error: insertError, data: inserted } = await admin
        .from('transactions')
        .upsert(rows, { onConflict: 'user_id,gmail_message_id', ignoreDuplicates: true })
        .select('id')

      if (insertError) errores.push(`Insert error: ${insertError.message}`)
      else transaccionesNuevas += inserted?.length ?? 0
    }

    // 8. FASE 4 — asignar mes_contable
    // Re-computar para todos los meses calendario con transacciones nuevas,
    // usando el set completo (existentes + nuevas) para detectar el sueldo correctamente.
    if (deduped.length > 0) {
      const mesesAfectados = [...new Set(deduped.map(({ extracted }) =>
        (extracted.fecha ? new Date(extracted.fecha) : new Date()).toISOString().slice(0, 7)
      ))]

      for (const mes of mesesAfectados) {
        const mesStart = `${mes}-01`
        const [y, m] = mes.split('-').map(Number)
        const mesEnd = new Date(y, m, 0).toISOString().slice(0, 10) // último día del mes

        const { data: txsMes } = await admin
          .from('transactions')
          .select('id, fecha, monto, tipo, comercio, descripcion')
          .eq('user_id', userId)
          .gte('fecha', mesStart)
          .lte('fecha', mesEnd + 'T23:59:59Z')

        if (!txsMes?.length) continue

        const conMes = asignarMesContable(txsMes)

        // Actualizar en batch (cada transacción individualmente por la API de Supabase)
        await Promise.all(conMes.map(t =>
          admin.from('transactions').update({
            mes_contable: t.mes_contable,
            es_sueldo:    t.es_sueldo ?? false,
          }).eq('id', t.id)
        ))
      }
    }

    console.log(`[sync] ${newIds.length} emails — ${parserCount} parser | ${omitidosCount} omitidos | ${preauthIds.length} Uber preauth | ${errores.length} errores`)

    await admin.from('sync_log').update({
      finished_at: new Date().toISOString(),
      correos_revisados: newIds.length,
      transacciones_nuevas: transaccionesNuevas,
      errores,
      skipped_ids: preauthIds,
      status: errores.length > 0 && transaccionesNuevas === 0 ? 'ERROR' : 'DONE',
    }).eq('id', syncId)

    return { correos_revisados: newIds.length, transacciones_nuevas: transaccionesNuevas, parser: parserCount, omitidos: omitidosCount, errores }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[syncService] error:', { userId }, err)
    await admin.from('sync_log').update({
      finished_at: new Date().toISOString(), errores: [message], status: 'ERROR',
    }).eq('id', syncId)
    throw err
  }
}

