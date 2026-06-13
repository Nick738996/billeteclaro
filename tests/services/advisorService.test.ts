import { vi, describe, it, expect, beforeEach } from 'vitest'
import { getInsights } from '@/lib/services/advisorService'
import type { SupabaseClient } from '@supabase/supabase-js'

// Groq no debe ser instanciado en estos tests — mockeamos el módulo completo
vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '{"insights":[]}' } }],
        }),
      },
    },
  })),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChainedQuery = Record<string, (...args: any[]) => any>

function makeSelectChain(returnData: unknown): ChainedQuery {
  const resolved = Promise.resolve({ data: returnData, error: null })
  const chain: ChainedQuery = {
    select:  () => chain,
    eq:      () => chain,
    gte:     () => chain,
    lte:     () => chain,
    single:  () => resolved,
    then:    (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
               resolved.then(onFulfilled, onRejected),
  }
  return chain
}

function makeMockSupabase(options: {
  transactions?: unknown[]
  budgets?: unknown[]
  cachedInsight?: unknown
}): SupabaseClient {
  const { transactions = [], budgets = [], cachedInsight = null } = options

  return {
    from: (table: string) => {
      if (table === 'transactions') return makeSelectChain(transactions)
      if (table === 'budgets')      return makeSelectChain(budgets)
      if (table === 'ai_insights') {
        return {
          ...makeSelectChain(cachedInsight),
          upsert: () => Promise.resolve({ error: null }),
        }
      }
      return makeSelectChain(null)
    },
  } as unknown as SupabaseClient
}

describe('getInsights', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('Bug 2 — guard para usuario sin transacciones', () => {
    it('devuelve insights vacíos sin llamar a Groq cuando no hay transacciones', async () => {
      const supabase = makeMockSupabase({ transactions: [] })
      const result = await getInsights(supabase, 'user-1', '2026-06', false)

      expect(result.insights).toEqual([])
      expect(result.cached).toBe(true)
    })

    it('devuelve insights vacíos incluso con force=true si no hay transacciones', async () => {
      const supabase = makeMockSupabase({ transactions: [] })
      const result = await getInsights(supabase, 'user-1', '2026-06', true)

      expect(result.insights).toEqual([])
      expect(result.cached).toBe(true)
    })

    it('con transacciones sí intenta generar insights (no retorna vacío anticipado)', async () => {
      const supabase = makeMockSupabase({
        transactions: [{
          id: 't1', user_id: 'user-1', gmail_message_id: 'msg1',
          fecha: '2026-06-10T10:00:00Z', monto: 50_000, comercio: 'Rappi',
          descripcion: null, banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SALIDAS',
          subcategoria: null, id_auditoria: null, moneda: 'COP', monto_usd: null,
          flags: [], raw_snippet: null, procesado: true, mes_contable: '2026-06',
          es_sueldo: false, created_at: '2026-06-10T00:00:00Z',
        }],
        cachedInsight: null,
      })

      // Con transacciones debe intentar el flujo completo (puede devolver [] si Groq
      // retorna vacío en el mock, pero NO es el early-return de "sin transacciones")
      const result = await getInsights(supabase, 'user-1', '2026-06', true)

      // El resultado puede ser [] (respuesta del mock de Groq), pero cached=false
      // porque fue un llamado real al flujo de generación
      expect(result.cached).toBe(false)
    })
  })
})
