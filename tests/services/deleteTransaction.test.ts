import { describe, it, expect } from 'vitest'
import { deleteTransaction } from '@/lib/services/transactionService'
import { SUBCATEGORIA_RETIRO_AHORROS, SUBCATEGORIA_APORTE_AHORROS } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>

interface TxFixture {
  id: string
  gmail_message_id: string | null
  subcategoria: string | null
  contraparte_id: string | null
  monto: number
}

function makeMockSupabase(tx: TxFixture | null) {
  let deleted = false
  const supabase = {
    from: (table: string) => {
      if (table !== 'transactions') throw new Error(`tabla inesperada en supabase: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve(
                tx ? { data: tx, error: null } : { data: null, error: { message: 'not found' } }
              ),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => { deleted = true; return Promise.resolve({ error: null }) },
          }),
        }),
      }
    },
  } as unknown as SupabaseClient
  return { supabase, wasDeleted: () => deleted }
}

function makeMockAdmin(account: { saldo: number } | null) {
  let updatedSaldo: number | null = null
  let syncLogRows: Row[] = []
  const admin = {
    from: (table: string) => {
      if (table === 'savings_accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve(
                  account ? { data: account, error: null } : { data: null, error: { message: 'not found' } }
                ),
              }),
            }),
          }),
          update: (patch: Row) => ({
            eq: () => ({
              eq: () => { updatedSaldo = patch.saldo as number; return Promise.resolve({ error: null }) },
            }),
          }),
        }
      }
      if (table === 'sync_log') {
        return {
          insert: (row: Row) => { syncLogRows = [row]; return Promise.resolve({ error: null }) },
        }
      }
      throw new Error(`tabla inesperada en admin: ${table}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  return { admin, getUpdatedSaldo: () => updatedSaldo, getSyncLog: () => syncLogRows }
}

describe('deleteTransaction — reversión de saldo en Mis Ahorros', () => {
  it('borrar un retiro de ahorros SUMA el monto de vuelta al saldo de la cuenta', async () => {
    const { supabase } = makeMockSupabase({
      id: 't1', gmail_message_id: 'manual_abc', monto: 200_000,
      subcategoria: SUBCATEGORIA_RETIRO_AHORROS, contraparte_id: 'acc-1',
    })
    const { admin, getUpdatedSaldo } = makeMockAdmin({ saldo: 300_000 })
    await deleteTransaction(supabase, admin, 'u1', 't1')
    expect(getUpdatedSaldo()).toBe(500_000)
  })

  it('borrar un aporte a ahorros RESTA el monto del saldo de la cuenta', async () => {
    const { supabase } = makeMockSupabase({
      id: 't1', gmail_message_id: 'manual_abc', monto: 200_000,
      subcategoria: SUBCATEGORIA_APORTE_AHORROS, contraparte_id: 'acc-1',
    })
    const { admin, getUpdatedSaldo } = makeMockAdmin({ saldo: 500_000 })
    await deleteTransaction(supabase, admin, 'u1', 't1')
    expect(getUpdatedSaldo()).toBe(300_000)
  })

  it('borrar una transacción manual normal (sin subcategoria de ahorros) no toca savings_accounts', async () => {
    const { supabase } = makeMockSupabase({
      id: 't1', gmail_message_id: 'manual_abc', monto: 50_000,
      subcategoria: null, contraparte_id: null,
    })
    const { admin, getUpdatedSaldo } = makeMockAdmin(null)
    await expect(deleteTransaction(supabase, admin, 'u1', 't1')).resolves.not.toThrow()
    expect(getUpdatedSaldo()).toBeNull()
  })

  it('borrar una transacción sincronizada (no manual) agrega su id a skipped_ids', async () => {
    const { supabase } = makeMockSupabase({
      id: 't1', gmail_message_id: 'gmail-msg-123', monto: 50_000,
      subcategoria: null, contraparte_id: null,
    })
    const { admin, getSyncLog } = makeMockAdmin(null)
    await deleteTransaction(supabase, admin, 'u1', 't1')
    expect(getSyncLog()[0]?.skipped_ids).toEqual(['gmail-msg-123'])
  })

  it('lanza error si la transacción no existe', async () => {
    const { supabase } = makeMockSupabase(null)
    const { admin } = makeMockAdmin(null)
    await expect(deleteTransaction(supabase, admin, 'u1', 't1')).rejects.toMatchObject({ status: 404 })
  })
})
