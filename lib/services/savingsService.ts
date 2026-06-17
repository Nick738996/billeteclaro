import type { SupabaseClient } from '@supabase/supabase-js'

export interface SavingsAccount {
  id: string
  nombre: string
  saldo: number
  color: string
  orden: number
}

export async function getSavingsAccounts(supabase: SupabaseClient, userId: string): Promise<SavingsAccount[]> {
  const { data, error } = await supabase
    .from('savings_accounts')
    .select('id, nombre, saldo, color, orden')
    .eq('user_id', userId)
    .order('orden', { ascending: true })
  if (error) throw error
  return (data ?? []) as SavingsAccount[]
}

export async function saveSavingsAccounts(
  supabase: SupabaseClient,
  userId: string,
  accounts: Omit<SavingsAccount, 'id'>[]
): Promise<void> {
  const { error: delError } = await supabase
    .from('savings_accounts')
    .delete()
    .eq('user_id', userId)
  if (delError) throw delError

  if (accounts.length === 0) return

  const rows = accounts.map((a, i) => ({
    user_id:    userId,
    nombre:     a.nombre,
    saldo:      a.saldo,
    color:      a.color,
    orden:      i,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('savings_accounts').insert(rows)
  if (error) throw error
}
