import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createManualTransactions } from '@/lib/services/transactionService'
import type { ManualTxInput } from '@/lib/services/transactionService'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/utils/auditId', () => ({
  generateAuditId: vi.fn().mockResolvedValue('0601-01'),
}))

// Mock de mesContableService para evitar llamadas reales a Supabase en unit tests.
// Los tests de integración del ciclo de pago se cubren en mesContable.test.ts.
vi.mock('@/lib/services/mesContableService', () => ({
  reassignCalendarMonths: vi.fn().mockResolvedValue(undefined),
}))

type InsertedRow = Record<string, unknown>

function makeMockSupabase(): { supabase: SupabaseClient; getInserted: () => InsertedRow[] } {
  let inserted: InsertedRow[] = []
  const supabase = {
    from: (_table: string) => ({
      insert: (rows: InsertedRow[]) => {
        inserted = rows
        return Promise.resolve({ error: null, data: null })
      },
    }),
  } as unknown as SupabaseClient
  return { supabase, getInserted: () => inserted }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOCK_ADMIN = {} as any

const BASE_ITEM: ManualTxInput = {
  fecha:     '2024-06-15',
  monto:     50_000,
  comercio:  'Rappi',
  categoria: 'SALIDAS',
  tipo:      'COMPRA',
  banco:     'RAPPICARD',
}

describe('createManualTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('mes_contable (Bug 1 — fix)', () => {
    it('asigna mes_contable como YYYY-MM tomado del campo fecha', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [
        { ...BASE_ITEM, fecha: '2024-06-15' },
      ])
      expect(getInserted()[0].mes_contable).toBe('2024-06')
    })

    it('mes_contable correcto en enero (mes con cero a la izquierda)', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [
        { ...BASE_ITEM, fecha: '2024-01-05' },
      ])
      expect(getInserted()[0].mes_contable).toBe('2024-01')
    })

    it('mes_contable correcto en diciembre (último mes del año)', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [
        { ...BASE_ITEM, fecha: '2024-12-31' },
      ])
      expect(getInserted()[0].mes_contable).toBe('2024-12')
    })

    it('múltiples transacciones en distintos meses reciben mes_contable correcto cada una', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [
        { ...BASE_ITEM, fecha: '2024-03-10' },
        { ...BASE_ITEM, fecha: '2024-04-20' },
        { ...BASE_ITEM, fecha: '2024-11-01' },
      ])
      const rows = getInserted()
      expect(rows[0].mes_contable).toBe('2024-03')
      expect(rows[1].mes_contable).toBe('2024-04')
      expect(rows[2].mes_contable).toBe('2024-11')
    })
  })

  describe('campos requeridos en el insert', () => {
    it('establece user_id en cada fila', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'user-abc', [BASE_ITEM])
      expect(getInserted()[0].user_id).toBe('user-abc')
    })

    it('gmail_message_id tiene prefijo manual_ (identifica transacciones manuales)', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [BASE_ITEM])
      expect(String(getInserted()[0].gmail_message_id)).toMatch(/^manual_/)
    })

    it('dos filas reciben gmail_message_id distintos (no colisión de UUID)', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [BASE_ITEM, BASE_ITEM])
      const rows = getInserted()
      expect(rows[0].gmail_message_id).not.toBe(rows[1].gmail_message_id)
    })

    it('establece procesado: true en todas las filas', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [BASE_ITEM, BASE_ITEM])
      for (const row of getInserted()) {
        expect(row.procesado).toBe(true)
      }
    })

    it('preserva categoria, tipo y banco del input', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      const item: ManualTxInput = { ...BASE_ITEM, categoria: 'AHORROS', tipo: 'INGRESO', banco: 'BANCOLOMBIA' }
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [item])
      const row = getInserted()[0]
      expect(row.categoria).toBe('AHORROS')
      expect(row.tipo).toBe('INGRESO')
      expect(row.banco).toBe('BANCOLOMBIA')
    })

    it('comercio vacío se guarda como null', async () => {
      const { supabase, getInserted } = makeMockSupabase()
      await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [
        { ...BASE_ITEM, comercio: '' },
      ])
      expect(getInserted()[0].comercio).toBeNull()
    })
  })

  describe('valor de retorno y manejo de errores', () => {
    it('devuelve el número de filas insertadas', async () => {
      const { supabase } = makeMockSupabase()
      const count = await createManualTransactions(supabase, MOCK_ADMIN, 'u1', [
        BASE_ITEM,
        BASE_ITEM,
        BASE_ITEM,
      ])
      expect(count).toBe(3)
    })

    it('lanza error si Supabase devuelve error en el insert', async () => {
      const supabase = {
        from: () => ({
          insert: () => Promise.resolve({ error: { message: 'violates RLS' }, data: null }),
        }),
      } as unknown as SupabaseClient

      await expect(
        createManualTransactions(supabase, MOCK_ADMIN, 'u1', [BASE_ITEM])
      ).rejects.toThrow('createManualTransactions')
    })
  })
})
