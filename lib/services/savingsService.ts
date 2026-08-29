import type { SupabaseClient } from '@supabase/supabase-js'
import type { createAdminClient } from '@/lib/supabase/server'
import { createManualTransactions } from '@/lib/services/transactionService'
import { SUBCATEGORIA_RETIRO_AHORROS, SUBCATEGORIA_APORTE_AHORROS } from '@/lib/types'

type Admin = ReturnType<typeof createAdminClient>

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

async function fetchOwnedAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
): Promise<{ id: string; nombre: string; saldo: number }> {
  const { data: account, error } = await supabase
    .from('savings_accounts')
    .select('id, nombre, saldo')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single()
  if (error || !account) throw Object.assign(new Error('Cuenta de ahorro no encontrada'), { status: 404 })
  return account
}

// ── Retirar de una cuenta de ahorro ───────────────────────────────────────
// Descuenta el monto del saldo de la cuenta y crea una transacción de tipo
// INGRESO (categoría INGRESO, no AHORROS — así no se contabiliza como gasto
// del mes en buildStats) para que el dinero cuente como disponible para
// gastar, tal como pidió el usuario.

export async function withdrawFromSavings(
  supabase: SupabaseClient,
  admin: Admin,
  userId: string,
  accountId: string,
  monto: number,
  nota?: string
): Promise<void> {
  const account = await fetchOwnedAccount(supabase, userId, accountId)
  if (monto > account.saldo) throw Object.assign(new Error('El monto supera el saldo disponible en esa cuenta'), { status: 400 })

  const { error: updateError } = await supabase
    .from('savings_accounts')
    .update({ saldo: account.saldo - monto, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', userId)
  if (updateError) throw updateError

  await createManualTransactions(supabase, admin, userId, [{
    fecha:          new Date().toISOString(),
    monto,
    comercio:       nota?.trim() || `Retiro de ${account.nombre}`,
    categoria:      'INGRESO',
    tipo:           'INGRESO',
    banco:          'OTRO',
    subcategoria:   SUBCATEGORIA_RETIRO_AHORROS,
    contraparte_id: accountId,
  }])
}

// ── Aportar a una cuenta de ahorro ────────────────────────────────────────
// Suma el monto al saldo de la cuenta y crea la transacción correspondiente
// (categoría AHORROS, cuenta como salida del mes en buildStats — igual que
// cualquier otra transferencia a ahorros) para que quede registro de a qué
// cuenta fue la plata, en vez de editar el saldo a mano sin dejar rastro.

export async function depositToSavings(
  supabase: SupabaseClient,
  admin: Admin,
  userId: string,
  accountId: string,
  monto: number,
  nota?: string
): Promise<void> {
  const account = await fetchOwnedAccount(supabase, userId, accountId)

  const { error: updateError } = await supabase
    .from('savings_accounts')
    .update({ saldo: account.saldo + monto, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', userId)
  if (updateError) throw updateError

  await createManualTransactions(supabase, admin, userId, [{
    fecha:          new Date().toISOString(),
    monto,
    comercio:       nota?.trim() || `Aporte a ${account.nombre}`,
    categoria:      'AHORROS',
    tipo:           'TRANSFERENCIA_ENVIADA',
    banco:          'OTRO',
    subcategoria:   SUBCATEGORIA_APORTE_AHORROS,
    contraparte_id: accountId,
  }])
}
