import { describe, it, expect } from 'vitest'
import { fetchMonthlyPlan, saveMonthlyPlan, computeMonthlyPlan } from '@/lib/services/monthlyPlanService'
import { createFakeSupabase } from '../helpers/fakeSupabase'

describe('fetchMonthlyPlan / saveMonthlyPlan', () => {
  it('retorna null cuando no hay plan para ese mes', async () => {
    const { supabase } = createFakeSupabase({ monthly_plan: [] })
    await expect(fetchMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toBeNull()
  })

  it('guarda y luego lee el plan del mes, con los items de desglose', async () => {
    const { supabase } = createFakeSupabase({ monthly_plan: [] })
    await saveMonthlyPlan(supabase, 'u1', '2026-09', {
      ingresoNetoMensual: 6_000_000,
      fijoTotalMonto: 2_800_000,
      fijoItems: [{ nombre: 'Arriendo', monto: 2_500_000 }, { nombre: 'Servicios', monto: 300_000 }],
      ahorroMetaMonto: 1_200_000,
      ahorroItems: [],
    })
    await expect(fetchMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toEqual({
      ingresoNetoMensual: 6_000_000,
      fijoTotalMonto: 2_800_000,
      fijoItems: [{ nombre: 'Arriendo', monto: 2_500_000 }, { nombre: 'Servicios', monto: 300_000 }],
      ahorroMetaMonto: 1_200_000,
      ahorroItems: [],
    })
  })

  it('un segundo save del mismo mes actualiza en vez de duplicar (upsert user_id+mes)', async () => {
    const { supabase, tables } = createFakeSupabase({ monthly_plan: [] })
    await saveMonthlyPlan(supabase, 'u1', '2026-09', { ingresoNetoMensual: 6_000_000, fijoTotalMonto: 2_000_000, fijoItems: [], ahorroMetaMonto: 1_000_000, ahorroItems: [] })
    await saveMonthlyPlan(supabase, 'u1', '2026-09', { ingresoNetoMensual: 7_000_000, fijoTotalMonto: 2_500_000, fijoItems: [], ahorroMetaMonto: 1_500_000, ahorroItems: [] })
    expect(tables.monthly_plan).toHaveLength(1)
    await expect(fetchMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toEqual({
      ingresoNetoMensual: 7_000_000,
      fijoTotalMonto: 2_500_000,
      fijoItems: [],
      ahorroMetaMonto: 1_500_000,
      ahorroItems: [],
    })
  })

  it('sin fijo_items/ahorro_items guardados (fila vieja), retorna arreglos vacíos en vez de romper', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 2_000_000, ahorro_meta_monto: 1_000_000 }],
    })
    await expect(fetchMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toEqual({
      ingresoNetoMensual: 6_000_000,
      fijoTotalMonto: 2_000_000,
      fijoItems: [],
      ahorroMetaMonto: 1_000_000,
      ahorroItems: [],
    })
  })
})

describe('computeMonthlyPlan', () => {
  it('retorna todo en cero si no hay plan para el mes (sin lanzar error)', async () => {
    const { supabase } = createFakeSupabase({ monthly_plan: [] })
    await expect(computeMonthlyPlan(supabase, 'u1', '2026-09')).resolves.toEqual({
      ingresoNetoMensual: 0,
      compromisoFijos: 0,
      metaAhorro: 0,
      poolVariableMensual: 0,
    })
  })

  it('deriva el pool variable = ingreso - fijoTotalMonto - ahorro, con un solo total de Fijo declarado', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 1_600_000, ahorro_meta_monto: 1_200_000 }],
    })

    const totals = await computeMonthlyPlan(supabase, 'u1', '2026-09')
    expect(totals).toEqual({
      ingresoNetoMensual: 6_000_000,
      compromisoFijos: 1_600_000,
      metaAhorro: 1_200_000,
      poolVariableMensual: 3_200_000, // 6M - 1.6M - 1.2M
    })
  })

  it('nunca retorna un pool negativo, aunque fijos+ahorro superen el ingreso', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 1_000_000, fijo_total_monto: 900_000, ahorro_meta_monto: 500_000 }],
    })

    const { poolVariableMensual } = await computeMonthlyPlan(supabase, 'u1', '2026-09')
    expect(poolVariableMensual).toBe(0)
  })
})
