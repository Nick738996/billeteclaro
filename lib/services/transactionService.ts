import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/server'
import { generateAuditId } from '@/lib/utils/auditId'
import { reassignCalendarMonths } from '@/lib/services/mesContableService'
import type { Categoria, Banco, TipoTransaccion, Transaction } from '@/lib/types'

type Admin = ReturnType<typeof createAdminClient>

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchMonthTransactions(
  supabase: SupabaseClient,
  userId: string,
  mes: string
): Promise<Transaction[]> {
  const ref = parseISO(`${mes}-01`)
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('fecha', startOfMonth(ref).toISOString())
    .lte('fecha', endOfMonth(ref).toISOString())
    .order('fecha', { ascending: false })

  if (error) throw new Error(`fetchMonthTransactions: ${error.message}`)
  return (data ?? []) as Transaction[]
}

// ── Manual transactions ───────────────────────────────────────────────────────

export interface ManualTxInput {
  fecha: string
  monto: number
  comercio: string
  categoria: Categoria
  tipo: TipoTransaccion
  banco: Banco
}

export async function createManualTransactions(
  supabase: SupabaseClient,
  admin: Admin,
  userId: string,
  items: ManualTxInput[]
): Promise<number> {
  const rows = []
  // Secuencial para evitar race condition en generateAuditId (mismo día → mismo count)
  for (const tx of items) {
    const fecha = new Date(tx.fecha)
    rows.push({
      user_id:          userId,
      gmail_message_id: `manual_${crypto.randomUUID()}`,
      fecha:            fecha.toISOString(),
      monto:            tx.monto,
      comercio:         tx.comercio || null,
      descripcion:      tx.comercio || null,
      banco:            tx.banco,
      tipo:             tx.tipo,
      categoria:        tx.categoria,
      id_auditoria:     await generateAuditId(admin, userId, fecha),
      mes_contable:     tx.fecha.slice(0, 7),
      procesado:        true,
    })
  }

  const { error } = await supabase.from('transactions').insert(rows)
  if (error) throw new Error(`createManualTransactions: ${error.message}`)

  // Reasignar mes_contable considerando el ciclo de pago (sueldo detectado en el mes)
  const calendarMonths = [...new Set(items.map(tx => tx.fecha.slice(0, 7)))]
  await reassignCalendarMonths(admin, userId, calendarMonths)

  return rows.length
}

// ── Categorize (batch) ────────────────────────────────────────────────────────

export interface CategoryChange {
  id: string
  categoria: Categoria
}

export async function batchCategorize(
  supabase: SupabaseClient,
  userId: string,
  changes: CategoryChange[]
): Promise<void> {
  const results = await Promise.all(
    changes.map(({ id, categoria }) =>
      supabase.from('transactions').update({ categoria }).eq('id', id).eq('user_id', userId)
    )
  )
  const failed = results.filter(r => r.error)
  if (failed.length > 0) throw new Error(`batchCategorize: ${failed.length} cambios fallaron`)
}

// ── Delete individual ─────────────────────────────────────────────────────────

export async function deleteTransaction(
  supabase: SupabaseClient,
  admin: Admin,
  userId: string,
  id: string
): Promise<void> {
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, gmail_message_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!tx) throw Object.assign(new Error('Not found'), { status: 404 })

  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(`deleteTransaction: ${error.message}`)

  // Gmail transactions: agregar a skipped_ids para que el próximo sync las ignore
  const isManual = tx.gmail_message_id?.startsWith('manual_')
  if (!isManual && tx.gmail_message_id) {
    await admin.from('sync_log').insert({
      user_id: userId,
      status: 'SKIPPED',
      skipped_ids: [tx.gmail_message_id],
      correos_revisados: 0,
      transacciones_nuevas: 0,
      errores: [],
    })
  }
}

// ── Patch single (usado por GET/PATCH /api/transactions) ─────────────────────

export interface TransactionPatch {
  categoria?: Categoria
  subcategoria?: string | null
  comercio?: string | null
}

export async function patchTransaction(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  updates: TransactionPatch
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw new Error(`patchTransaction: ${error.message}`)
  return data as Transaction
}

// ── Delete all (reset) ────────────────────────────────────────────────────────

export async function deleteAllTransactions(admin: Admin, userId: string): Promise<void> {
  const [{ error: txError }, { error: logError }, { error: settingsError }] = await Promise.all([
    admin.from('transactions').delete().eq('user_id', userId),
    admin.from('sync_log').delete().eq('user_id', userId),
    admin.from('user_settings').update({ onboarding_completed: false }).eq('user_id', userId),
  ])
  if (txError)      throw new Error(`deleteAllTransactions (transactions): ${txError.message}`)
  if (logError)     throw new Error(`deleteAllTransactions (sync_log): ${logError.message}`)
  if (settingsError) throw new Error(`deleteAllTransactions (user_settings): ${settingsError.message}`)
}
