import { describe, it, expect } from 'vitest'
import {
  getCapaForTransaccion,
  getCustomCapaOverrides,
  saveCategoryCapa,
  resetCategoryCapa,
  deleteCustomCategory,
  listCustomCategories,
} from '@/lib/services/layerService'
import type { Transaction } from '@/lib/types'
import { createFakeSupabase } from '../helpers/fakeSupabase'

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    user_id: 'u1',
    gmail_message_id: 'm1',
    fecha: '2026-09-10T12:00:00Z',
    monto: 10000,
    comercio: 'Comercio',
    descripcion: null,
    banco: 'OTRO',
    tipo: 'COMPRA',
    categoria: 'SALIDAS',
    subcategoria: null,
    id_auditoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
    raw_snippet: null,
    procesado: true,
    mes_contable: '2026-09',
    es_sueldo: false,
    created_at: '2026-09-10T12:00:00Z',
    contraparte_id: null,
    capa_override: null,
    ...overrides,
  }
}

describe('getCapaForTransaccion', () => {
  it('ninguna categoría predeterminada es fija: los fijos salen del plan', () => {
    expect(getCapaForTransaccion(tx({ categoria: 'SUSCRIPCIONES' }), {})).toBe('VARIABLE')
    expect(getCapaForTransaccion(tx({ categoria: 'HOGAR' }), {})).toBe('VARIABLE')
    expect(getCapaForTransaccion(tx({ categoria: 'ARRIENDO' }), { ARRIENDO: 'FIJO' })).toBe('FIJO')
    expect(getCapaForTransaccion(tx({ categoria: 'SALIDAS' }), {})).toBe('VARIABLE')
    expect(getCapaForTransaccion(tx({ categoria: 'AHORROS' }), {})).toBe('AHORRO')
  })

  it('retorna null para categorías fuera de las 3 capas', () => {
    expect(getCapaForTransaccion(tx({ categoria: 'TRANSFERENCIA' }), {})).toBeNull()
    expect(getCapaForTransaccion(tx({ categoria: 'INGRESO' }), {})).toBeNull()
    expect(getCapaForTransaccion(tx({ categoria: 'REEMBOLSABLE' }), {})).toBeNull()
    expect(getCapaForTransaccion(tx({ categoria: 'PRESTAMO' }), {})).toBeNull()
  })

  it('capa_override gana sobre el default de la categoría', () => {
    expect(getCapaForTransaccion(tx({ categoria: 'SALIDAS', capa_override: 'FIJO' }), {})).toBe('FIJO')
  })

  it('el override de category_capas gana sobre el default, pero pierde contra capa_override', () => {
    const overrides = { HOGAR: 'VARIABLE' as const }
    expect(getCapaForTransaccion(tx({ categoria: 'HOGAR' }), overrides)).toBe('VARIABLE')
    expect(getCapaForTransaccion(tx({ categoria: 'HOGAR', capa_override: 'FIJO' }), overrides)).toBe('FIJO')
  })

  it('una categoría custom sin override cae en VARIABLE por defecto (no en null)', () => {
    expect(getCapaForTransaccion(tx({ categoria: 'MASCOTAS' }), {})).toBe('VARIABLE')
  })

  it('una categoría custom SÍ respeta su override en category_capas', () => {
    expect(getCapaForTransaccion(tx({ categoria: 'COLEGIO_HIJOS' }), { COLEGIO_HIJOS: 'FIJO' })).toBe('FIJO')
  })
})

describe('getCustomCapaOverrides / saveCategoryCapa', () => {
  it('guarda y luego lee el override de una categoría', async () => {
    const { supabase } = createFakeSupabase({ category_capas: [] })
    await saveCategoryCapa(supabase, 'u1', 'MIS_MASCOTAS', 'VARIABLE')
    const overrides = await getCustomCapaOverrides(supabase, 'u1')
    expect(overrides).toEqual({ MIS_MASCOTAS: 'VARIABLE' })
  })

  it('un segundo save de la misma categoría hace upsert (no duplica)', async () => {
    const { supabase } = createFakeSupabase({ category_capas: [] })
    await saveCategoryCapa(supabase, 'u1', 'HOGAR', 'FIJO')
    await saveCategoryCapa(supabase, 'u1', 'HOGAR', 'VARIABLE')
    const overrides = await getCustomCapaOverrides(supabase, 'u1')
    expect(overrides).toEqual({ HOGAR: 'VARIABLE' })
  })
})

describe('resetCategoryCapa / deleteCustomCategory', () => {
  it('reset borra el override y la categoría vuelve a su capa por defecto', async () => {
    const { supabase } = createFakeSupabase({ category_capas: [{ user_id: 'u1', categoria: 'HOGAR', capa: 'FIJO' }] })
    await resetCategoryCapa(supabase, 'u1', 'HOGAR')
    const overrides = await getCustomCapaOverrides(supabase, 'u1')
    expect(getCapaForTransaccion(tx({ categoria: 'HOGAR' }), overrides)).toBe('VARIABLE')
  })

  it('eliminar una categoría custom mueve sus transacciones a OTRO y borra su capa y presupuestos', async () => {
    const { supabase, tables } = createFakeSupabase({
      category_capas: [{ user_id: 'u1', categoria: 'MASCOTAS', capa: 'FIJO' }],
      transactions: [
        { id: 'a', user_id: 'u1', categoria: 'MASCOTAS' },
        { id: 'b', user_id: 'u1', categoria: 'MASCOTAS' },
        { id: 'c', user_id: 'u1', categoria: 'SALIDAS' },
        { id: 'd', user_id: 'u2', categoria: 'MASCOTAS' },
      ],
      budgets: [{ user_id: 'u1', mes: '2026-10', categoria: 'MASCOTAS', monto_presupuestado: 100 }],
    })
    const movidas = await deleteCustomCategory(supabase, 'u1', 'MASCOTAS')
    expect(movidas).toBe(2)
    expect(tables.transactions.map(t => t.categoria)).toEqual(['OTRO', 'OTRO', 'SALIDAS', 'MASCOTAS'])
    expect(tables.category_capas).toEqual([])
    expect(tables.budgets).toEqual([])
  })

  it('no deja eliminar una categoría predeterminada', async () => {
    const { supabase } = createFakeSupabase({ transactions: [] })
    await expect(deleteCustomCategory(supabase, 'u1', 'HOGAR')).rejects.toThrow()
  })
})

describe('listCustomCategories', () => {
  it('une overrides, categorías vistas en transacciones y recién creadas, sin las predeterminadas', () => {
    const result = listCustomCategories(
      { DEPORTES: 'FIJO', HOGAR: 'VARIABLE' },
      [{ categoria: 'MASCOTAS' }, { categoria: 'SALIDAS' }],
      ['REGALOS']
    )
    expect(result).toEqual(['DEPORTES', 'MASCOTAS', 'REGALOS'])
  })
})
