import type { SupabaseClient } from '@supabase/supabase-js'
import type { Categoria } from '@/lib/types'
import { CATEGORIA_CAPA_DEFAULT } from '@/lib/types'
import { getCustomCapaOverrides } from '@/lib/services/layerService'

export interface MonthlyPlanInput {
  ingresoNetoMensual: number
  ahorroMetaMonto: number
}

export async function fetchMonthlyPlan(
  supabase: SupabaseClient,
  userId: string,
  mes: string
): Promise<MonthlyPlanInput | null> {
  const { data, error } = await supabase
    .from('monthly_plan')
    .select('ingreso_neto_mensual, ahorro_meta_monto')
    .eq('user_id', userId)
    .eq('mes', mes)
    .maybeSingle()

  if (error) throw new Error(`fetchMonthlyPlan: ${error.message}`)
  if (!data) return null

  return {
    ingresoNetoMensual: Number(data.ingreso_neto_mensual),
    ahorroMetaMonto: Number(data.ahorro_meta_monto),
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
      ahorro_meta_monto: input.ahorroMetaMonto,
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
 * Deriva el Pool Variable Mensual (sección 2.A del brief): nunca se ingresa
 * a mano, sale de "págate a ti mismo primero" — ingreso menos lo apartado
 * para Capa 1 (Ahorro) y Capa 2 (Fijos, sumado desde `budgets` filtrando por
 * capa FIJO). Si no hay plan para ese mes, retorna todo en cero en vez de
 * lanzar error — la UI debe poder mostrar un CTA de "configura tu plan" sin
 * caerse.
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

  const { data: budgetRows, error: budgetError } = await supabase
    .from('budgets')
    .select('categoria, monto_presupuestado')
    .eq('user_id', userId)
    .eq('mes', mes)

  if (budgetError) throw new Error(`computeMonthlyPlan: ${budgetError.message}`)

  const capaOverrides = await getCustomCapaOverrides(supabase, userId)

  const compromisoFijos = (budgetRows ?? []).reduce((sum, row) => {
    const capa = capaOverrides[row.categoria] ?? CATEGORIA_CAPA_DEFAULT[row.categoria as Categoria] ?? null
    return capa === 'FIJO' ? sum + Number(row.monto_presupuestado) : sum
  }, 0)

  const poolVariableMensual = Math.max(
    0,
    plan.ingresoNetoMensual - compromisoFijos - plan.ahorroMetaMonto
  )

  return {
    ingresoNetoMensual: plan.ingresoNetoMensual,
    compromisoFijos,
    metaAhorro: plan.ahorroMetaMonto,
    poolVariableMensual,
  }
}
