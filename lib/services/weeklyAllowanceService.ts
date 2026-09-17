import type { SupabaseClient } from '@supabase/supabase-js'
import type { WeeklyAllowance } from '@/lib/types'
import { colombiaDayRangeUTC } from '@/lib/utils/mesContable'
import { computeMonthlyPlan } from '@/lib/services/monthlyPlanService'
import { getCapaForTransaccion, getCustomCapaOverrides } from '@/lib/services/layerService'
import { isGasto } from '@/lib/types'

// ── Helpers de fecha (strings 'YYYY-MM-DD', sin dependencia de timezone) ───

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function daysInMonth(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function mesOfDate(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / msPerDay)
}

/** Lunes (ISO) de la semana que contiene `dateStr`. */
export function getIsoWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=domingo .. 6=sábado
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  dt.setUTCDate(dt.getUTCDate() + diffToMonday)
  return dt.toISOString().slice(0, 10)
}

// ── Cupo base ponderado por día — resuelve semanas partidas entre meses ────

/**
 * Cupo base de una semana: suma, día por día, la porción del Pool Variable
 * Mensual que le toca a ese día (poolVariableMensual / díasDelMes). Si la
 * semana cruza dos meses (mes que empieza jueves, termina martes — caso
 * borde #1 del brief) cada día aporta la porción del mes al que pertenece,
 * en vez de partir la semana completa por un solo mes.
 */
export async function computeWeeklyCupoBase(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string
): Promise<number> {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const meses = [...new Set(days.map(mesOfDate))]

  const poolPorMes = new Map<string, number>()
  for (const mes of meses) {
    const { poolVariableMensual } = await computeMonthlyPlan(supabase, userId, mes)
    poolPorMes.set(mes, poolVariableMensual)
  }

  return days.reduce((sum, day) => {
    const mes = mesOfDate(day)
    return sum + (poolPorMes.get(mes) ?? 0) / daysInMonth(mes)
  }, 0)
}

// ── Ledger semanal ──────────────────────────────────────────────────────

async function findWeekAllowance(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string
): Promise<WeeklyAllowance | null> {
  const { data, error } = await supabase
    .from('weekly_allowances')
    .select('*')
    .eq('user_id', userId)
    .eq('semana_inicio', weekStart)
    .maybeSingle()

  if (error) throw new Error(`findWeekAllowance: ${error.message}`)
  return (data as WeeklyAllowance) ?? null
}

export async function ensureWeekAllowance(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string
): Promise<WeeklyAllowance> {
  const existing = await findWeekAllowance(supabase, userId, weekStart)
  if (existing) return existing

  const cupoBase = await computeWeeklyCupoBase(supabase, userId, weekStart)
  const semanaFin = addDays(weekStart, 6)

  const { data, error } = await supabase
    .from('weekly_allowances')
    .insert({
      user_id: userId,
      mes: mesOfDate(weekStart),
      semana_inicio: weekStart,
      semana_fin: semanaFin,
      cupo_base: cupoBase,
      ajuste_carryover: 0,
      cerrada: false,
      decision: null,
    })
    .select('*')
    .single()

  if (error) throw new Error(`ensureWeekAllowance: ${error.message}`)
  return data as WeeklyAllowance
}

async function sumVariableGastoEnRango(
  supabase: SupabaseClient,
  userId: string,
  desde: string,
  hasta: string
): Promise<number> {
  const { start } = colombiaDayRangeUTC(desde)
  const { end } = colombiaDayRangeUTC(hasta)

  const { data, error } = await supabase
    .from('transactions')
    .select('monto, tipo, categoria, capa_override')
    .eq('user_id', userId)
    .gte('fecha', start)
    .lte('fecha', end)

  if (error) throw new Error(`sumVariableGastoEnRango: ${error.message}`)

  const capaOverrides = await getCustomCapaOverrides(supabase, userId)

  return (data ?? []).reduce((sum, tx) => {
    const capa = getCapaForTransaccion(tx, capaOverrides)
    if (capa === 'VARIABLE' && isGasto(tx.tipo, tx.categoria)) return sum + Number(tx.monto)
    return sum
  }, 0)
}

async function applyCarryover(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  ajuste: number
): Promise<void> {
  const week = await ensureWeekAllowance(supabase, userId, weekStart)
  const { error } = await supabase
    .from('weekly_allowances')
    .update({ ajuste_carryover: week.ajuste_carryover + ajuste, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('semana_inicio', weekStart)
  if (error) throw new Error(`applyCarryover: ${error.message}`)
}

/**
 * Cierra una semana (sección 2.B.4 del brief). Si sobró dinero, la decisión
 * (bonus de ahorro vs. rollover) decide si ese saldo pasa a la semana
 * siguiente — 'rollover' por defecto (mínima fricción) si no se pasa
 * decisión explícita. Si hubo sobregiro, el descuento a la siguiente semana
 * NO es opcional (protege la meta de ahorro) y aplica sin importar `decision`.
 */
export async function closeWeek(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  decision?: 'bonus_ahorro' | 'rollover'
): Promise<void> {
  const week = await ensureWeekAllowance(supabase, userId, weekStart)
  if (week.cerrada) return

  const gastado = await sumVariableGastoEnRango(supabase, userId, weekStart, week.semana_fin)
  const saldo = week.cupo_base + week.ajuste_carryover - gastado

  const finalDecision = decision ?? 'rollover'
  const ajusteSiguiente = saldo < 0 ? saldo : finalDecision === 'rollover' ? saldo : 0

  const { error } = await supabase
    .from('weekly_allowances')
    .update({ cerrada: true, decision: finalDecision, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('semana_inicio', weekStart)
  if (error) throw new Error(`closeWeek: ${error.message}`)

  if (ajusteSiguiente !== 0) {
    await applyCarryover(supabase, userId, addDays(weekStart, 7), ajusteSiguiente)
  }
}

export type BurnEstado = 'verde' | 'amarillo' | 'rojo'

export interface WeeklyStatus {
  mes: string
  semanaInicio: string
  semanaFin: string
  cupoBase: number
  ajusteCarryover: number
  cupoTotal: number
  gastado: number
  restante: number
  pctGastado: number
  pctTiempo: number
  diasTranscurridos: number
  diasRestantes: number
  estado: BurnEstado
}

/**
 * Cierra en cadena, de la más vieja a la más nueva, las semanas anteriores a
 * `weekStart` que ya vencieron y siguen abiertas — pero SOLO si esa semana
 * llegó a existir como fila (el usuario la abrió o transaccionó en ella).
 * Una semana que nunca se creó no se fabrica retroactivamente solo para
 * cerrarla: si el usuario configura su plan a mitad de mes, o no abre la
 * app por varias semanas, no debe aparecer un rollover fantasma de semanas
 * que nunca existieron para él.
 */
async function closeOverdueWeeksBefore(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  referenceDateStr: string
): Promise<void> {
  const overdue: string[] = []
  let cursor = addDays(weekStart, -7)

  while (true) {
    const week = await findWeekAllowance(supabase, userId, cursor)
    if (!week || week.cerrada || week.semana_fin >= referenceDateStr) break
    overdue.unshift(cursor)
    cursor = addDays(cursor, -7)
  }

  for (const ws of overdue) await closeWeek(supabase, userId, ws)
}

/**
 * Estado vivo del Cupo Semanal para `referenceDateStr` (normalmente "hoy").
 * Cierra de forma lazy las semanas anteriores vencidas que hayan quedado
 * abiertas — no hay cron, se resuelve en el próximo GET, igual que
 * reassignCalendarMonths se dispara lazy en el pipeline de ingesta.
 */
export async function getLiveWeeklyStatus(
  supabase: SupabaseClient,
  userId: string,
  referenceDateStr: string
): Promise<WeeklyStatus> {
  const weekStart = getIsoWeekStart(referenceDateStr)

  await closeOverdueWeeksBefore(supabase, userId, weekStart, referenceDateStr)

  const week = await ensureWeekAllowance(supabase, userId, weekStart)
  const gastado = await sumVariableGastoEnRango(supabase, userId, weekStart, referenceDateStr)

  const cupoTotal = week.cupo_base + week.ajuste_carryover
  const restante = cupoTotal - gastado
  const diasTranscurridos = Math.min(7, diffDays(weekStart, referenceDateStr) + 1)
  const pctTiempo = Math.min(100, (diasTranscurridos / 7) * 100)
  const pctGastado = cupoTotal > 0 ? (gastado / cupoTotal) * 100 : gastado > 0 ? 100 : 0

  let estado: BurnEstado
  if (pctGastado > 100) estado = 'rojo'
  else if (pctGastado > pctTiempo + 10) estado = 'amarillo'
  else estado = 'verde'

  return {
    mes: week.mes,
    semanaInicio: week.semana_inicio,
    semanaFin: week.semana_fin,
    cupoBase: week.cupo_base,
    ajusteCarryover: week.ajuste_carryover,
    cupoTotal,
    gastado,
    restante,
    pctGastado,
    pctTiempo,
    diasTranscurridos,
    diasRestantes: 7 - diasTranscurridos,
    estado,
  }
}
