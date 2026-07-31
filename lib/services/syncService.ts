import { GmailProvider, OutlookProvider } from '@/lib/email'
import { detectBank } from '@/lib/email/gmail'
import { trySpecificParser } from '@/lib/parsers'
import { generateAuditId } from '@/lib/utils/auditId'
import { deduplicateUber, matchUberAgainstPersisted } from '@/lib/utils/deduplicateUber'
import { reassignCalendarMonths } from '@/lib/services/mesContableService'
import { createAdminClient } from '@/lib/supabase/server'
import type { EmailProvider } from '@/lib/email/types'
import type { ExtractedTransaction } from '@/lib/types'

type Admin = ReturnType<typeof createAdminClient>

const MAX_EMAILS  = 2000
const BATCH_SIZE  = 10
// Sincronizar desde esta fecha en adelante
const SYNC_FROM   = new Date('2026-05-01')

export interface SyncResult {
  correos_revisados:    number
  total_correos_banco:  number
  transacciones_nuevas: number
  parser:   number
  omitidos: number
  errores:  string[]
}

export async function runSync(userId: string, admin: Admin): Promise<SyncResult> {
  // 1. Tokens
  const { data: tokenRow } = await admin
    .from('user_tokens').select('*').eq('user_id', userId).single()

  if (!tokenRow?.gmail_refresh_token && !tokenRow?.outlook_refresh_token) {
    throw Object.assign(new Error('No hay cuenta de correo conectada. Por favor conecta Gmail u Outlook.'), { status: 400 })
  }

  // 2. Sync log
  const { data: syncLog } = await admin
    .from('sync_log')
    .insert({ user_id: userId, status: 'RUNNING' })
    .select('id')
    .single()
  const syncId = syncLog?.id

  try {
    // 3. Construir providers disponibles
    const providers: EmailProvider[] = []
    if (tokenRow.gmail_refresh_token) {
      providers.push(new GmailProvider(tokenRow.gmail_refresh_token))
    }
    if (tokenRow.outlook_refresh_token) {
      providers.push(new OutlookProvider(tokenRow.outlook_refresh_token))
    }

    // 4. IDs ya procesados (transactions + todos los skipped_ids de sync_log)
    //    + transacciones de Uber ya persistidas, para dedup de pre-auth/cobro
    //    final cuando caen en syncs distintos (ver matchUberAgainstPersisted)
    const [{ data: existing }, { data: pastLogs }, { data: persistedUber }] = await Promise.all([
      admin.from('transactions').select('gmail_message_id').eq('user_id', userId),
      admin.from('sync_log').select('skipped_ids').eq('user_id', userId),
      admin.from('transactions').select('id, fecha, monto').eq('user_id', userId).ilike('comercio', '%uber%'),
    ])

    const processedIds = new Set((existing ?? []).map(r => r.gmail_message_id))
    for (const log of pastLogs ?? []) {
      for (const id of (log.skipped_ids ?? []) as string[]) processedIds.add(id)
    }

    // 5. Listar todos los IDs de bancos de cada provider en paralelo
    const allIdsByProvider = await Promise.all(
      providers.map(p => p.listBankMessageIds(SYNC_FROM))
    )
    const allMessageIds = allIdsByProvider.flat()
    console.log(`[sync] emails encontrados total: ${allMessageIds.length} (Gmail/Outlook sin filtrar)`)
    const providerByMessageId = new Map<string, EmailProvider>()
    allIdsByProvider.forEach((ids, i) => ids.forEach(id => providerByMessageId.set(id, providers[i])))

    const newIds = allMessageIds.filter(id => !processedIds.has(id)).slice(0, MAX_EMAILS)

    const errores: string[] = []
    let parserCount = 0, omitidosCount = 0
    const allTransactions: Array<{ id: string; extracted: ExtractedTransaction }> = []
    const bancoCount: Record<string, number> = {}

    // 6. FASE 1 — parsers específicos (sin fallback IA)
    for (let i = 0; i < newIds.length; i += BATCH_SIZE) {
      const batch = newIds.slice(i, i + BATCH_SIZE)
      const emailResults = await Promise.allSettled(
        batch.map(id => {
          const provider = providerByMessageId.get(id)!
          return provider.getMessage(id)
        })
      )

      for (const result of emailResults) {
        if (result.status === 'rejected') { errores.push(`Fetch error: ${result.reason}`); continue }
        const email = result.value
        const banco = detectBank(email.from)
        bancoCount[banco] = (bancoCount[banco] ?? 0) + 1
        if (banco === 'RAPPIPAY' || banco === 'RAPPICARD') {
          console.log(`[scan] ${banco} — "${email.subject}" | body[0:120]=${JSON.stringify(email.body.slice(0, 120))}`)
        }
        const parsed = trySpecificParser(banco, {
          id: email.id,
          from: email.from,
          subject: email.subject,
          date: email.date,
          body: email.body,
        })
        if (parsed) {
          parserCount++
          const isIncome = parsed.tipo === 'INGRESO' || parsed.tipo === 'TRANSFERENCIA_RECIBIDA'
          if (banco === 'RAPPIPAY' || isIncome) {
            console.log(`[sync] parsed ${banco} tipo=${parsed.tipo} monto=${parsed.monto} fecha=${parsed.fecha?.slice(0, 10)} — "${email.subject}"`)
          }
          allTransactions.push({ id: email.id, extracted: { ...parsed, banco } })
        } else {
          omitidosCount++
          console.log(`[sync] omitido ${banco} (${email.provider}) — "${email.subject}"`)
          if (banco === 'RAPPIPAY') {
            console.log(`[sync] RAPPIPAY body[0:200]=${JSON.stringify(email.body.slice(0, 200))}`)
          }
        }
      }
    }

    // 7. FASE 2 — dedup Uber
    //    a) dentro del mismo lote (pre-auth y cobro final llegaron en este mismo sync)
    //    b) contra el historial ya persistido (pre-auth de un sync anterior +
    //       cobro final que llega en este sync, o al revés)
    const { transactions: dedupedBatch, preauthIds: batchPreauthIds } = deduplicateUber(allTransactions)
    const { remaining: deduped, matches: crossSyncMatches } = matchUberAgainstPersisted(
      dedupedBatch,
      (persistedUber ?? []).map(t => ({ id: t.id, fecha: t.fecha, monto: t.monto })),
    )
    const preauthIds = [...batchPreauthIds, ...crossSyncMatches.map(m => m.newTxId)]

    // Actualiza las filas ya persistidas cuyo cobro final llegó en este sync
    // (monto/fecha estimados en la pre-auth → monto/fecha reales del cobro)
    const updates = crossSyncMatches.filter(m => m.updatePersisted)
    if (updates.length > 0) {
      await Promise.all(updates.map(m => {
        const tx = allTransactions.find(t => t.id === m.newTxId)!.extracted
        const fecha = tx.fecha ? new Date(tx.fecha) : new Date()
        console.log(`[sync] Uber cross-sync: actualizando fila ${m.persistedId} con cobro final (monto=${tx.monto})`)
        return admin.from('transactions').update({
          monto: tx.monto, fecha: fecha.toISOString(),
          descripcion: tx.descripcion, flags: tx.flags,
        }).eq('id', m.persistedId)
      }))
    }
    if (crossSyncMatches.length > 0) {
      console.log(`[sync] Uber cross-sync: ${crossSyncMatches.length} match(es) contra historial persistido (${updates.length} actualizados, ${crossSyncMatches.length - updates.length} descartados)`)
    }

    // 8. FASE 3 — insertar
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

      if (insertError) {
        console.error(`[sync] Insert error (${rows.length} rows intentados):`, insertError.message)
        errores.push(`Insert error: ${insertError.message}`)
      } else {
        console.log(`[sync] Insertados: ${inserted?.length ?? 0} de ${rows.length} rows`)
        transaccionesNuevas += inserted?.length ?? 0
      }
    }

    // 9. FASE 4 — asignar mes_contable
    //    incluye también los meses de las filas de Uber actualizadas por el
    //    cross-sync match (el cobro final puede caer en un mes distinto al
    //    de la pre-auth original)
    const mesesUpdates = updates.map(m => {
      const fecha = allTransactions.find(t => t.id === m.newTxId)!.extracted.fecha
      return (fecha ? new Date(fecha) : new Date()).toISOString().slice(0, 7)
    })
    const mesesAfectados = [...new Set([
      ...deduped.map(({ extracted }) =>
        (extracted.fecha ? new Date(extracted.fecha) : new Date()).toISOString().slice(0, 7)
      ),
      ...mesesUpdates,
    ])]
    if (mesesAfectados.length > 0) {
      await reassignCalendarMonths(admin, userId, mesesAfectados)
    }

    const providerNames = providers.map(p => p.name).join('+')
    console.log(`[sync] ${providerNames} — ${newIds.length} emails — ${parserCount} parser | ${omitidosCount} omitidos | ${preauthIds.length} Uber preauth | ${errores.length} errores`)
    console.log(`[sync] por banco:`, bancoCount)

    await admin.from('sync_log').update({
      finished_at: new Date().toISOString(),
      correos_revisados: newIds.length,
      transacciones_nuevas: transaccionesNuevas,
      errores,
      skipped_ids: preauthIds,
      status: errores.length > 0 && transaccionesNuevas === 0 ? 'ERROR' : 'DONE',
    }).eq('id', syncId)

    return {
      correos_revisados: newIds.length,
      total_correos_banco: allMessageIds.length,
      transacciones_nuevas: transaccionesNuevas,
      parser: parserCount,
      omitidos: omitidosCount,
      errores,
    }

  } catch (err) {
    console.error('[syncService] error:', { userId }, err)

    // Google OAuth responde con status 400 + message "invalid_grant" cuando el
    // refresh_token de Gmail fue revocado o expiró (apps sin verificar: 7 días).
    // Sin este chequeo el error crudo de Google se filtra tal cual al cliente.
    let message = err instanceof Error ? err.message : String(err)
    if (err instanceof Error && message === 'invalid_grant' && tokenRow.gmail_refresh_token) {
      await admin.from('user_tokens').update({ gmail_refresh_token: null }).eq('user_id', userId)
      message = 'El token de acceso a Gmail expiró. Vuelve a iniciar sesión para reconectar tu correo.'
    }

    await admin.from('sync_log').update({
      finished_at: new Date().toISOString(), errores: [message], status: 'ERROR',
    }).eq('id', syncId)

    throw Object.assign(new Error(message), { status: 400 })
  }
}
