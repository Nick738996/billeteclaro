import { describe, it, expect } from 'vitest'
import { fetchMonthlyPlan, saveMonthlyPlan, computeMonthlyPlan } from '@/lib/services/monthlyPlanService'
import { createFakeSupabase } from '../helpers/fakeSupabase'

describe('fetchMonthlyPlan / saveMonthlyPlan', () => {
  it('retorna null cuando no hay plan para ese mes', async () => {
    const { supabase } = createFakeSupabase({ monthly_plan: [] })
    await expect(fetchMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toBeNull()
  })

  it('guarda y luego lee el plan del mes', async () => {
    const { supabase } = createFakeSupabase({ monthly_plan: [] })
    await saveMonthlyPlan(supabase, 'u1', '2026-09', { ingresoNetoMensual: 6_000_000, ahorroMetaMonto: 1_200_000 })
    await expect(fetchMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toEqual({
      ingresoNetoMensual: 6_000_000,
      ahorroMetaMonto: 1_200_000,
    })
  })

  it('un segundo save del mismo mes actualiza en vez de duplicar (upsert user_id+mes)', async () => {
    const { supabase, tables } = createFakeSupabase({ monthly_plan: [] })
    await saveMonthlyPlan(supabase, 'u1', '2026-09', { ingresoNetoMensual: 6_000_000, ahorroMetaMonto: 1_000_000 })
    await saveMonthlyPlan(supabase, 'u1', '2026-09', { ingresoNetoMensual: 7_000_000, ahorroMetaMonto: 1_500_000 })
    expect(tables.monthly_plan).toHaveLength(1)
    await expect(fetchMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toEqual({
      ingresoNetoMensual: 7_000_000,
      ahorroMetaMonto: 1_500_000,
    })
  })
})

describe('computeMonthlyPlan', () => {
  it('retorna todo en cero si no hay plan para el mes (sin lanzar error)', async () => {
    const { supabase } = createFakeSupabase({ monthly_plan: [], budgets: [] })
    await expect(computeMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toEqual({
      ingresoNetoMensual: 0,
      compromisoFijos: 0,
      metaAhorro: 0,
      poolVariableMensual: 0,
    })
  })

  it('deriva el pool variable = ingreso - fijos - ahorro, sumando solo categorías FIJO', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, ahorro_meta_monto: 1_200_000 }],
      budgets: [
        { user_id: 'u1', mes: '2026-09', categoria: 'HOGAR', monto_presupuestado: 1_500_000 }, // FIJO
        { user_id: 'u1', mes: '2026-09', categoria: 'SUSCRIPCIONES', monto_presupuestado: 100_000 }, // FIJO
        { user_id: 'u1', mes: '2026-09', categoria: 'SALIDAS', monto_presupuestado: 400_000 }, // VARIABLE, no cuenta
      ],
      category_capas: [],
    })

    const totals = await computeMonthlyPlan(supabase, 'u1', '2026-09')
    expect(totals).toEqual({
      ingresoNetoMensual: 6_000_000,
      compromisoFijos: 1_600_000, // 1.5M + 100K, sin la SALIDAS variable
      metaAhorro: 1_200_000,
      poolVariableMensual: 3_200_000, // 6M - 1.6M - 1.2M
    })
  })

  it('nunca retorna un pool negativo, aunque fijos+ahorro superen el ingreso', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 1_000_000, ahorro_meta_monto: 500_000 }],
      budgets: [{ user_id: 'u1', mes: '2026-09', categoria: 'HOGAR', monto_presupuestado: 900_000 }],
      category_capas: [],
    })

    const { poolVariableMensual } = await computeMonthlyPlan(supabase, 'u1', '2026-09')
    expect(poolVariableMensual).toBe(0)
  })

  it('un override en category_capas reclasifica una categoría built-in (HOGAR como VARIABLE) fuera de fijos', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, ahorro_meta_monto: 0 }],
      budgets: [{ user_id: 'u1', mes: '2026-09', categoria: 'HOGAR', monto_presupuestado: 1_500_000 }],
      category_capas: [{ user_id: 'u1', categoria: 'HOGAR', capa: 'VARIABLE' }],
    })

    const totals = await computeMonthlyPlan(supabase, 'u1', '2026-09')
    expect(totals.compromisoFijos).toBe(0)
    expect(totals.poolVariableMensual).toBe(6_000_000)
  })
})
