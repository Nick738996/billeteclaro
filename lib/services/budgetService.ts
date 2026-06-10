import type { SupabaseClient } from '@supabase/supabase-js'
import type { Categoria, BudgetEntry, BudgetSubcat } from '@/lib/types'

export type { BudgetEntry, BudgetSubcat }

export interface BudgetSaveItem {
  categoria: Categoria
  monto: number
  subcategorias: BudgetSubcat[]
}

export async function fetchBudgets(
  supabase: SupabaseClient,
  userId: string,
  mes: string
): Promise<Record<string, BudgetEntry>> {
  const { data, error } = await supabase
    .from('budgets')
    .select('categoria, monto_presupuestado, subcategorias')
    .eq('user_id', userId)
    .eq('mes', mes)

  if (error) throw new Error(`fetchBudgets: ${error.message}`)

  const budgets: Record<string, BudgetEntry> = {}
  for (const row of data ?? []) {
    budgets[row.categoria] = {
      monto: Number(row.monto_presupuestado),
      subcategorias: (row.subcategorias as BudgetSubcat[]) ?? [],
    }
  }
  return budgets
}

export async function saveBudgets(
  supabase: SupabaseClient,
  userId: string,
  mes: string,
  items: BudgetSaveItem[]
): Promise<void> {
  if (!items.length) return

  const toDelete = items.filter(i => i.monto === 0).map(i => i.categoria)
  const toUpsert = items
    .filter(i => i.monto > 0)
    .map(i => ({
      user_id: userId,
      mes,
      categoria: i.categoria,
      monto_presupuestado: i.monto,
      subcategorias: i.subcategorias,
    }))

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('user_id', userId)
      .eq('mes', mes)
      .in('categoria', toDelete)
    if (error) throw new Error(`saveBudgets delete: ${error.message}`)
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('budgets')
      .upsert(toUpsert, { onConflict: 'user_id,mes,categoria' })
    if (error) throw new Error(`saveBudgets upsert: ${error.message}`)
  }
}
