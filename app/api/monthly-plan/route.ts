import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { fetchMonthlyPlan, saveMonthlyPlan } from '@/lib/services/monthlyPlanService'
import type { BudgetSubcat } from '@/lib/types'

function validItems(value: unknown): BudgetSubcat[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((i): i is BudgetSubcat =>
      typeof i === 'object' && i !== null &&
      typeof (i as BudgetSubcat).nombre === 'string' &&
      typeof (i as BudgetSubcat).monto === 'number'
    )
    .map(i => ({ nombre: i.nombre, monto: i.monto }))
}

// GET /api/monthly-plan?mes=YYYY-MM
export const GET = withAuth(async (req, user, supabase) => {
  const mes = new URL(req.url).searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)
  try {
    const plan = await fetchMonthlyPlan(supabase, user.id, mes)
    return ok({ mes, plan })
  } catch (e) {
    console.error('[GET /api/monthly-plan]', { userId: user.id, mes }, e)
    return err('Error cargando el plan mensual')
  }
})

// PUT /api/monthly-plan  body: { mes, ingresoNetoMensual, fijoTotalMonto, fijoItems?, ahorroMetaMonto, ahorroItems?, imprevistosMonto? }
export const PUT = withAuth(async (req, user, supabase) => {
  const body = await req.json() as {
    mes?: string
    ingresoNetoMensual?: number
    fijoTotalMonto?: number
    fijoItems?: unknown
    ahorroMetaMonto?: number
    ahorroItems?: unknown
    imprevistosMonto?: number
  }
  const { mes, ingresoNetoMensual, fijoTotalMonto, fijoItems, ahorroMetaMonto, ahorroItems, imprevistosMonto } = body

  if (!mes || typeof ingresoNetoMensual !== 'number' || ingresoNetoMensual <= 0) {
    return err('mes e ingresoNetoMensual (> 0) son requeridos', 400)
  }

  try {
    await saveMonthlyPlan(supabase, user.id, mes, {
      ingresoNetoMensual,
      fijoTotalMonto: typeof fijoTotalMonto === 'number' && fijoTotalMonto >= 0 ? fijoTotalMonto : 0,
      fijoItems: validItems(fijoItems),
      ahorroMetaMonto: typeof ahorroMetaMonto === 'number' && ahorroMetaMonto >= 0 ? ahorroMetaMonto : 0,
      ahorroItems: validItems(ahorroItems),
      imprevistosMonto: typeof imprevistosMonto === 'number' && imprevistosMonto >= 0 ? imprevistosMonto : 0,
    })
    return ok({ ok: true })
  } catch (e) {
    console.error('[PUT /api/monthly-plan]', { userId: user.id, mes }, e)
    return err('Error guardando el plan mensual')
  }
})
