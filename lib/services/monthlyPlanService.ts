import type { SupabaseClient } from '@supabase/supabase-js'
import type { BudgetSubcat } from '@/lib/types'

export interface MonthlyPlanInput {
  ingresoNetoMensual: number
  /** Total declarado de gastos fijos este mes — un solo número que usa el
   * resto de la app (pool variable, cupo semanal). Qué transacciones cuentan
   * como Fijo se decide aparte (category_capas / transactions.capa_override).
   * fijoItems es solo la ayuda opcional para llegar a este número: si el
   * usuario prefiere desglosarlo (arriendo, servicios...) en vez de
   * calcularlo de cabeza, esos ítems no tienen clasificación propia — nada
   * más suman. */
  fijoTotalMonto: number
  fijoItems: BudgetSubcat[]
  ahorroMetaMonto: number
  ahorroItems: BudgetSubcat[]
}

export async function fetchMonthlyPlan(
  supabase: SupabaseClient,
  userId: string,
  mes: string
): Promise<MonthlyPlanInput | null> {
  const { data, error } = await supabase
    .from('monthly_plan')
    .select('ingreso_neto_mensual, fijo_total_monto, fijo_items, ahorro_meta_monto, ahorro_items')
    .eq('user_id', userId)
    .eq('mes', mes)
    .maybeSingle()

  if (error) throw new Error(`fetchMonthlyPlan: ${error.message}`)
  if (!data) return null

  return {
    ingresoNetoMensual: Number(data.ingreso_neto_mensual),
    fijoTotalMonto: Number(data.fijo_total_monto),
    fijoItems: (data.fijo_items as BudgetSubcat[]) ?? [],
    ahorroMetaMonto: Number(data.ahorro_meta_monto),
    ahorroItems: (data.ahorro_items as BudgetSubcat[]) ?? [],
  }
}

export async function saveMonthlyPlan(
  supabase: SupabaseClient,
  userId: string,
  mes: string,
  input: MonthlyPlanInput
): Promise<void> {
  const { error } = await supabase.from('monthly_plan').upsert(
    {
      user_id: userId,
      mes,
      ingreso_neto_mensual: input.ingresoNetoMensual,
      fijo_total_monto: input.fijoTotalMonto,
      fijo_items: input.fijoItems,
      ahorro_meta_monto: input.ahorroMetaMonto,
      ahorro_items: input.ahorroItems,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,mes' }
  )
  if (error) throw new Error(`saveMonthlyPlan: ${error.message}`)
}

export interface MonthlyPlanTotals {
  ingresoNetoMensual: number
  compromisoFijos: number
  metaAhorro: number
  /** Ingreso - Compromiso Fijos - Meta de Ahorro, nunca negativo */
  poolVariableMensual: number
}

/**
 * Deriva el Pool Variable Mensual (sección 2.A del brief): ingreso menos lo
 * apartado para Ahorro y el total declarado de Fijos. Ya no suma `budgets`
 * por categoría — Fijo es un solo monto declarado en monthly_plan (a mano o
 * desglosado en fijo_items, da igual, el número ya viene sumado), así que
 * esto es aritmética simple. Si no hay plan para ese mes, retorna todo en
 * cero en vez de lanzar error — la UI debe poder mostrar un CTA de
 * "configura tu plan" sin caerse.
 */
export async function computeMonthlyPlan(
  supabase: SupabaseClient,
  userId: string,
  mes: string
): Promise<MonthlyPlanTotals> {
  const plan = await fetchMonthlyPlan(supabase, userId, mes)
  if (!plan) {
    return { ingresoNetoMensual: 0, compromisoFijos: 0, metaAhorro: 0, poolVariableMensual: 0 }
  }

  const poolVariableMensual = Math.max(
    0,
    plan.ingresoNetoMensual - plan.fijoTotalMonto - plan.ahorroMetaMonto
  )

  return {
    ingresoNetoMensual: plan.ingresoNetoMensual,
    compromisoFijos: plan.fijoTotalMonto,
    metaAhorro: plan.ahorroMetaMonto,
    poolVariableMensual,
  }
}
