import { vi, describe, it, expect, beforeEach } from 'vitest'
import { withdrawFromSavings, depositToSavings } from '@/lib/services/savingsService'
import { SUBCATEGORIA_RETIRO_AHORROS, SUBCATEGORIA_APORTE_AHORROS } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/utils/auditId', () => ({
  generateAuditId: vi.fn().mockResolvedValue('0601-01'),
}))

vi.mock('@/lib/services/mesContableService', () => ({
  reassignCalendarMonths: vi.fn().mockResolvedValue(undefined),
}))

type Row = Record<string, unknown>

interface Account {
  id: string
  nombre: string
  saldo: number
}

function makeMockSupabase(account: Account | null) {
  let updatedPatch: Row | null = null
  let insertedRows: Row[] = []

  const supabase = {
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
              eq: () => {
                updatedPatch = patch
                return Promise.resolve({ error: null })
              },
            }),
          }),
        }
      }
      if (table === 'transactions') {
        return {
          insert: (rows: Row[]) => {
            insertedRows = rows
            return Promise.resolve({ error: null, data: null })
          },
        }
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
  } as unknown as SupabaseClient

  return { supabase, getUpdatedPatch: () => updatedPatch, getInserted: () => insertedRows }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOCK_ADMIN = {} as any

describe('withdrawFromSavings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('descuenta el monto del saldo de la cuenta', async () => {
    const { supabase, getUpdatedPatch } = makeMockSupabase({ id: 'a1', nombre: 'Bancolombia Ahorros', saldo: 500_000 })
    await withdrawFromSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 200_000)
    expect(getUpdatedPatch()?.saldo).toBe(300_000)
  })

  it('crea una transacción tipo INGRESO / categoria INGRESO (no cuenta como gasto)', async () => {
    const { supabase, getInserted } = makeMockSupabase({ id: 'a1', nombre: 'Bancolombia Ahorros', saldo: 500_000 })
    await withdrawFromSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 200_000)
    const row = getInserted()[0]
    expect(row.tipo).toBe('INGRESO')
    expect(row.categoria).toBe('INGRESO')
    expect(row.monto).toBe(200_000)
    expect(row.banco).toBe('OTRO')
  })

  it('usa "Retiro de {nombre cuenta}" como comercio por default', async () => {
    const { supabase, getInserted } = makeMockSupabase({ id: 'a1', nombre: 'Bancolombia Ahorros', saldo: 500_000 })
    await withdrawFromSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 200_000)
    expect(getInserted()[0].comercio).toBe('Retiro de Bancolombia Ahorros')
  })

  it('usa la nota provista como comercio cuando se pasa', async () => {
    const { supabase, getInserted } = makeMockSupabase({ id: 'a1', nombre: 'Bancolombia Ahorros', saldo: 500_000 })
    await withdrawFromSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 200_000, 'Arreglo del carro')
    expect(getInserted()[0].comercio).toBe('Arreglo del carro')
  })

  it('lanza error 400 si el monto supera el saldo', async () => {
    const { supabase } = makeMockSupabase({ id: 'a1', nombre: 'Bancolombia Ahorros', saldo: 100_000 })
    await expect(withdrawFromSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 200_000))
      .rejects.toMatchObject({ status: 400 })
  })

  it('lanza error 404 si la cuenta no existe o no pertenece al usuario', async () => {
    const { supabase } = makeMockSupabase(null)
    await expect(withdrawFromSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 100_000))
      .rejects.toMatchObject({ status: 404 })
  })

  it('marca la transacción con subcategoria retiro_ahorros (para poder filtrarla)', async () => {
    const { supabase, getInserted } = makeMockSupabase({ id: 'a1', nombre: 'Bancolombia Ahorros', saldo: 500_000 })
    await withdrawFromSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 200_000)
    expect(getInserted()[0].subcategoria).toBe(SUBCATEGORIA_RETIRO_AHORROS)
  })
})

describe('depositToSavings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('suma el monto al saldo de la cuenta', async () => {
    const { supabase, getUpdatedPatch } = makeMockSupabase({ id: 'a1', nombre: 'Cooperativa', saldo: 2_700_000 })
    await depositToSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 300_000)
    expect(getUpdatedPatch()?.saldo).toBe(3_000_000)
  })

  it('crea una transacción tipo TRANSFERENCIA_ENVIADA / categoria AHORROS', async () => {
    const { supabase, getInserted } = makeMockSupabase({ id: 'a1', nombre: 'Cooperativa', saldo: 2_700_000 })
    await depositToSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 300_000)
    const row = getInserted()[0]
    expect(row.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(row.categoria).toBe('AHORROS')
    expect(row.monto).toBe(300_000)
    expect(row.subcategoria).toBe(SUBCATEGORIA_APORTE_AHORROS)
  })

  it('usa "Aporte a {nombre cuenta}" como comercio por default', async () => {
    const { supabase, getInserted } = makeMockSupabase({ id: 'a1', nombre: 'Cooperativa', saldo: 2_700_000 })
    await depositToSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 300_000)
    expect(getInserted()[0].comercio).toBe('Aporte a Cooperativa')
  })

  it('no exige que el monto tenga un tope (a diferencia del retiro)', async () => {
    const { supabase, getUpdatedPatch } = makeMockSupabase({ id: 'a1', nombre: 'Cooperativa', saldo: 1_000 })
    await depositToSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 5_000_000)
    expect(getUpdatedPatch()?.saldo).toBe(5_001_000)
  })

  it('lanza error 404 si la cuenta no existe o no pertenece al usuario', async () => {
    const { supabase } = makeMockSupabase(null)
    await expect(depositToSavings(supabase, MOCK_ADMIN, 'u1', 'a1', 100_000))
      .rejects.toMatchObject({ status: 404 })
  })
})
