import { describe, it, expect } from 'vitest'
import {
  getCapaForTransaccion,
  computeLayerTotals,
  isSalidaFueraDelPlan,
  getCustomCapaOverrides,
  saveCategoryCapa,
  resetCategoryCapa,
  deleteCustomCategory,
  listCustomCategories,
  computeIngresoReal,
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
  it('usa el default de la categoría cuando no hay override', () => {
    expect(getCapaForTransaccion(tx({ categoria: 'SUSCRIPCIONES' }), {})).toBe('FIJO')
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

describe('computeLayerTotals', () => {
  it('suma AHORRO aunque isGasto lo excluya del gasto tradicional', () => {
    const txs = [tx({ categoria: 'AHORROS', tipo: 'TRANSFERENCIA_ENVIADA', monto: 300_000 })]
    expect(computeLayerTotals(txs, {})).toEqual({ ahorro: 300_000, fijo: 0, variable: 0 })
  })

  it('suma FIJO y VARIABLE solo si isGasto es true', () => {
    const txs = [
      tx({ categoria: 'SUSCRIPCIONES', tipo: 'COMPRA', monto: 40_000 }),
      tx({ categoria: 'SALIDAS', tipo: 'COMPRA', monto: 60_000 }),
    ]
    expect(computeLayerTotals(txs, {})).toEqual({ ahorro: 0, fijo: 40_000, variable: 60_000 })
  })

  it('excluye transacciones fuera de las 3 capas (TRANSFERENCIA, INGRESO, REEMBOLSABLE)', () => {
    const txs = [
      tx({ categoria: 'INGRESO', tipo: 'INGRESO', monto: 5_000_000 }),
      tx({ categoria: 'TRANSFERENCIA', tipo: 'TRANSFERENCIA_RECIBIDA', monto: 100_000 }),
    ]
    expect(computeLayerTotals(txs, {})).toEqual({ ahorro: 0, fijo: 0, variable: 0 })
  })

  it('un préstamo que diste NO cuenta como ahorro', () => {
    const txs = [tx({ categoria: 'PRESTAMO', tipo: 'TRANSFERENCIA_ENVIADA', monto: 343_000 })]
    expect(computeLayerTotals(txs, {})).toEqual({ ahorro: 0, fijo: 0, variable: 0 })
  })

  it('una entrada categorizada como INVERSION (rendimientos) no suma como ahorro', () => {
    const txs = [tx({ categoria: 'INVERSION', tipo: 'INGRESO', monto: 12_000 })]
    expect(computeLayerTotals(txs, {})).toEqual({ ahorro: 0, fijo: 0, variable: 0 })
  })

  it('un gasto real (isGasto) marcado con capa_override=AHORRO cuenta como apartado', () => {
    const txs = [tx({ categoria: 'COMPRAS_ONLINE', tipo: 'COMPRA', monto: 200_000, capa_override: 'AHORRO' })]
    expect(computeLayerTotals(txs, {})).toEqual({ ahorro: 200_000, fijo: 0, variable: 0 })
  })

  it('respeta el toggle "Gasto Fijo": una compra normal reclasificada a FIJO', () => {
    const txs = [tx({ categoria: 'HOGAR', tipo: 'COMPRA', monto: 80_000, capa_override: 'VARIABLE' })]
    expect(computeLayerTotals(txs, {})).toEqual({ ahorro: 0, fijo: 0, variable: 80_000 })
  })
})

describe('isSalidaFueraDelPlan', () => {
  it('préstamos y transferencias sin categorizar salen del plan', () => {
    expect(isSalidaFueraDelPlan(tx({ categoria: 'PRESTAMO', tipo: 'TRANSFERENCIA_ENVIADA' }), {})).toBe(true)
    expect(isSalidaFueraDelPlan(tx({ categoria: 'TRANSFERENCIA', tipo: 'TRANSFERENCIA_ENVIADA' }), {})).toBe(true)
  })

  it('pagos de tarjeta, entradas y gastos que ya suman en una capa no', () => {
    expect(isSalidaFueraDelPlan(tx({ categoria: 'TRANSFERENCIA', tipo: 'ABONO_DEUDA' }), {})).toBe(false)
    expect(isSalidaFueraDelPlan(tx({ categoria: 'INGRESO', tipo: 'TRANSFERENCIA_RECIBIDA' }), {})).toBe(false)
    expect(isSalidaFueraDelPlan(tx({ categoria: 'SALIDAS', tipo: 'COMPRA' }), {})).toBe(false)
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
    const { supabase } = createFakeSupabase({ category_capas: [{ user_id: 'u1', categoria: 'HOGAR', capa: 'VARIABLE' }] })
    await resetCategoryCapa(supabase, 'u1', 'HOGAR')
    const overrides = await getCustomCapaOverrides(supabase, 'u1')
    expect(getCapaForTransaccion(tx({ categoria: 'HOGAR' }), overrides)).toBe('FIJO')
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

describe('computeIngresoReal', () => {
  it('no cuenta los retiros de tus propios ahorros como ingreso', () => {
    const txs = [
      tx({ tipo: 'INGRESO', monto: 10_000_000 }),
      tx({ tipo: 'TRANSFERENCIA_RECIBIDA', monto: 700_000 }),
      tx({ tipo: 'INGRESO', monto: 2_600_000, subcategoria: 'retiro_ahorros' }),
      tx({ tipo: 'COMPRA', monto: 50_000 }),
    ]
    expect(computeIngresoReal(txs)).toBe(10_700_000)
  })
})
