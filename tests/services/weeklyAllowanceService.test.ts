import { describe, it, expect } from 'vitest'
import {
  addDays,
  daysInMonth,
  mesOfDate,
  getIsoWeekStart,
  computeWeeklyCupoBase,
  ensureWeekAllowance,
  closeWeek,
  getLiveWeeklyStatus,
} from '@/lib/services/weeklyAllowanceService'
import { createFakeSupabase } from '../helpers/fakeSupabase'

// Fixtures de septiembre 2026: 1 sep = martes, por lo que la semana que
// empieza el lunes 31 de agosto cruza agosto (1 día) y septiembre (6 días) —
// exactamente el caso borde #1 del brief (mes que no empieza en lunes).

describe('helpers de fecha', () => {
  it('addDays suma días cruzando de mes', () => {
    expect(addDays('2026-08-31', 6)).toBe('2026-09-06')
  })

  it('daysInMonth cuenta bien meses de 30 y 31 días, y años bisiestos', () => {
    expect(daysInMonth('2026-09')).toBe(30)
    expect(daysInMonth('2026-08')).toBe(31)
    expect(daysInMonth('2028-02')).toBe(29) // bisiesto
    expect(daysInMonth('2026-02')).toBe(28)
  })

  it('mesOfDate extrae el mes calendario', () => {
    expect(mesOfDate('2026-09-17')).toBe('2026-09')
  })

  it('getIsoWeekStart retorna el lunes de la semana (jueves → lunes anterior)', () => {
    expect(getIsoWeekStart('2026-09-17')).toBe('2026-09-14') // hoy es jueves
  })

  it('getIsoWeekStart retorna el mismo día si ya es lunes', () => {
    expect(getIsoWeekStart('2026-09-14')).toBe('2026-09-14')
  })

  it('getIsoWeekStart maneja el domingo (retrocede 6 días, no 1)', () => {
    expect(getIsoWeekStart('2026-09-20')).toBe('2026-09-14')
  })
})

describe('computeWeeklyCupoBase — semanas partidas entre meses', () => {
  it('pondera cada día por el pool del mes al que pertenece (caso borde #1)', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [
        { user_id: 'u1', mes: '2026-08', ingreso_neto_mensual: 3_100_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }, // 100k/día (31 días)
        { user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }, // 200k/día (30 días)
      ],
      budgets: [],
      category_capas: [],
    })

    // semana 2026-08-31 (lunes) .. 2026-09-06 (domingo): 1 día en agosto, 6 en septiembre
    const cupo = await computeWeeklyCupoBase(supabase, 'u1', '2026-08-31')
    expect(cupo).toBe(1 * 100_000 + 6 * 200_000) // 1_300_000
  })

  it('una semana completa dentro de un solo mes usa solo su pool', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }],
      budgets: [],
      category_capas: [],
    })

    const cupo = await computeWeeklyCupoBase(supabase, 'u1', '2026-09-14') // 14..20 sep, toda dentro de sep
    expect(cupo).toBe(7 * 200_000) // 1_400_000
  })

  it('sin plan para el mes, esa porción del cupo es cero (no lanza error)', async () => {
    const { supabase } = createFakeSupabase({ monthly_plan: [], budgets: [], category_capas: [] })
    const cupo = await computeWeeklyCupoBase(supabase, 'u1', '2026-09-14')
    expect(cupo).toBe(0)
  })
})

describe('ensureWeekAllowance', () => {
  it('crea la fila con el cupo_base calculado si no existe', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
    })

    const week = await ensureWeekAllowance(supabase, 'u1', '2026-09-14')
    expect(week.cupo_base).toBe(1_400_000)
    expect(week.semana_fin).toBe('2026-09-20')
    expect(week.mes).toBe('2026-09')
    expect(week.cerrada).toBe(false)
  })

  it('es idempotente: la segunda llamada retorna la misma fila sin duplicar', async () => {
    const { supabase, tables } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
    })

    const first = await ensureWeekAllowance(supabase, 'u1', '2026-09-14')
    const second = await ensureWeekAllowance(supabase, 'u1', '2026-09-14')
    expect(second.id).toBe(first.id)
    expect(tables.weekly_allowances).toHaveLength(1)
  })

  it('una semana ABIERTA refleja de inmediato un cambio al plan mensual (el usuario editó ingreso/fijo/ahorro a mitad de semana)', async () => {
    const { supabase, tables } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
    })

    const before = await ensureWeekAllowance(supabase, 'u1', '2026-09-14')
    expect(before.cupo_base).toBe(1_400_000) // 6M / 30 días * 7

    // el usuario sube su ingreso neto mensual (ej. se auto-llenó con ingresos reales más altos)
    tables.monthly_plan[0].ingreso_neto_mensual = 9_000_000

    const after = await ensureWeekAllowance(supabase, 'u1', '2026-09-14')
    expect(after.id).toBe(before.id) // misma fila, no duplica
    expect(after.cupo_base).toBe(2_100_000) // 9M / 30 días * 7
    expect(tables.weekly_allowances).toHaveLength(1)
  })

  it('una semana ya CERRADA mantiene su cupo_base congelado aunque el plan cambie después (protege el historial y el rollover ya decidido)', async () => {
    const { supabase, tables } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }],
      budgets: [],
      category_capas: [],
      weekly_allowances: [
        { user_id: 'u1', mes: '2026-09', semana_inicio: '2026-09-14', semana_fin: '2026-09-20', cupo_base: 1_400_000, ajuste_carryover: 0, cerrada: true, decision: 'rollover' },
      ],
    })

    tables.monthly_plan[0].ingreso_neto_mensual = 9_000_000

    const week = await ensureWeekAllowance(supabase, 'u1', '2026-09-14')
    expect(week.cupo_base).toBe(1_400_000)
  })
})

function txRow(overrides: Record<string, unknown>) {
  return {
    user_id: 'u1',
    monto: 0,
    tipo: 'COMPRA',
    categoria: 'SALIDAS',
    capa_override: null,
    fecha: '2026-09-15T15:00:00Z',
    ...overrides,
  }
}

describe('getLiveWeeklyStatus', () => {
  const basePlan = { user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }
  // semana 2026-09-14 (lun) .. 2026-09-20 (dom), cupo_base = 1_400_000
  // "hoy" = 2026-09-17 (jueves) → día 4 de 7 → pctTiempo ≈ 57.14%

  it('estado verde cuando el ritmo de gasto va igual o por debajo del tiempo transcurrido', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [txRow({ monto: 700_000 })], // 50% del cupo vs 57% del tiempo
    })

    const status = await getLiveWeeklyStatus(supabase, 'u1', '2026-09-17')
    expect(status.cupoBase).toBe(1_400_000)
    expect(status.gastado).toBe(700_000)
    expect(status.restante).toBe(700_000)
    expect(status.estado).toBe('verde')
  })

  it('estado amarillo cuando el gasto excede el ritmo esperado pero queda saldo', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [txRow({ monto: 1_000_000 })], // 71.4% del cupo vs 57%+10=67% de tiempo
    })

    const status = await getLiveWeeklyStatus(supabase, 'u1', '2026-09-17')
    expect(status.estado).toBe('amarillo')
    expect(status.restante).toBe(400_000)
  })

  it('estado rojo cuando el gasto supera el 100% del cupo semanal', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [txRow({ monto: 1_500_000 })], // 107% del cupo
    })

    const status = await getLiveWeeklyStatus(supabase, 'u1', '2026-09-17')
    expect(status.estado).toBe('rojo')
    expect(status.restante).toBe(-100_000)
  })

  it('estado rojo incluso con cupo total en cero (ingreso = fijos + ahorro), donde pctGastado topaba en 100 y nunca cruzaba a rojo', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [{ user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 1_400_000, fijo_total_monto: 0, ahorro_meta_monto: 1_400_000 }],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [txRow({ monto: 50_000 })], // cupoBase = 0, cualquier gasto ya es sobregiro
    })

    const status = await getLiveWeeklyStatus(supabase, 'u1', '2026-09-17')
    expect(status.cupoBase).toBe(0)
    expect(status.restante).toBe(-50_000)
    expect(status.estado).toBe('rojo')
  })

  it('ignora transacciones de otras capas (FIJO, AHORRO) al sumar el gasto variable', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [
        txRow({ monto: 500_000, categoria: 'SALIDAS' }), // VARIABLE, cuenta
        txRow({ monto: 300_000, categoria: 'HOGAR' }), // FIJO, no cuenta
        txRow({ monto: 200_000, categoria: 'AHORROS', tipo: 'TRANSFERENCIA_ENVIADA' }), // AHORRO, no cuenta
      ],
    })

    const status = await getLiveWeeklyStatus(supabase, 'u1', '2026-09-17')
    expect(status.gastado).toBe(500_000)
  })
})

describe('closeWeek — mecánica de cierre semanal (sección 2.B.4)', () => {
  const basePlan = { user_id: 'u1', mes: '2026-09', ingreso_neto_mensual: 6_000_000, fijo_total_monto: 0, ahorro_meta_monto: 0 }
  // semana a cerrar: 2026-09-14..20, cupo_base = 1_400_000

  it('rollover (default): el saldo positivo pasa como ajuste a la semana siguiente', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [txRow({ monto: 1_000_000 })], // saldo = 400_000
    })

    await closeWeek(supabase, 'u1', '2026-09-14')

    const closed = await ensureWeekAllowance(supabase, 'u1', '2026-09-14')
    expect(closed.cerrada).toBe(true)
    expect(closed.decision).toBe('rollover')

    const next = await ensureWeekAllowance(supabase, 'u1', '2026-09-21')
    expect(next.ajuste_carryover).toBe(400_000)
  })

  it('bonus_ahorro: el saldo positivo NO pasa a la semana siguiente', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [txRow({ monto: 1_000_000 })], // saldo = 400_000
    })

    await closeWeek(supabase, 'u1', '2026-09-14', 'bonus_ahorro')

    const next = await ensureWeekAllowance(supabase, 'u1', '2026-09-21')
    expect(next.ajuste_carryover).toBe(0)
  })

  it('sobregiro: el déficit se descuenta de la siguiente semana SIEMPRE, aunque la decisión sea bonus_ahorro', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [txRow({ monto: 2_000_000 })], // saldo = -600_000
    })

    await closeWeek(supabase, 'u1', '2026-09-14', 'bonus_ahorro')

    const next = await ensureWeekAllowance(supabase, 'u1', '2026-09-21')
    expect(next.ajuste_carryover).toBe(-600_000)
  })

  it('es idempotente: cerrar una semana ya cerrada no vuelve a aplicar el ajuste', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [txRow({ monto: 1_000_000 })], // saldo = 400_000
    })

    await closeWeek(supabase, 'u1', '2026-09-14')
    await closeWeek(supabase, 'u1', '2026-09-14') // segunda vez: no debería duplicar el ajuste

    const next = await ensureWeekAllowance(supabase, 'u1', '2026-09-21')
    expect(next.ajuste_carryover).toBe(400_000)
  })

  it('getLiveWeeklyStatus cierra de forma lazy la semana anterior vencida y hereda su ajuste', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      // gasto de la semana anterior (14..20 sep) muy por debajo del cupo → sobra 900k
      transactions: [txRow({ monto: 500_000, fecha: '2026-09-15T15:00:00Z' })],
    })

    // el usuario sí abrió/usó la semana 14..20 (existe la fila) pero nunca la cerró
    await ensureWeekAllowance(supabase, 'u1', '2026-09-14')

    // "hoy" = 2026-09-24 (semana siguiente, jueves) — la semana 14..20 ya venció y sigue abierta
    const status = await getLiveWeeklyStatus(supabase, 'u1', '2026-09-24')
    expect(status.semanaInicio).toBe('2026-09-21')
    expect(status.ajusteCarryover).toBe(900_000) // 1_400_000 - 500_000
    expect(status.cupoTotal).toBe(1_400_000 + 900_000)
  })

  it('no fabrica rollover de una semana anterior que nunca existió (usuario nuevo o inactivo)', async () => {
    const { supabase } = createFakeSupabase({
      monthly_plan: [basePlan],
      budgets: [],
      category_capas: [],
      weekly_allowances: [],
      transactions: [],
    })

    // primera vez que el usuario abre el dashboard, "hoy" ya está varias semanas dentro del mes
    const status = await getLiveWeeklyStatus(supabase, 'u1', '2026-09-24')
    expect(status.ajusteCarryover).toBe(0)
    expect(status.cupoTotal).toBe(status.cupoBase)
  })
})
