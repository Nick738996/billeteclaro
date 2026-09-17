import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { fetchMonthlyPlan, saveMonthlyPlan } from '@/lib/services/monthlyPlanService'

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

// PUT /api/monthly-plan  body: { mes, ingresoNetoMensual, ahorroMetaMonto }
export const PUT = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { mes?: string; ingresoNetoMensual?: number; ahorroMetaMonto?: number }
  const { mes, ingresoNetoMensual, ahorroMetaMonto } = body

  if (!mes || typeof ingresoNetoMensual !== 'number' || ingresoNetoMensual <= 0) {
    return err('mes e ingresoNetoMensual (> 0) son requeridos', 400)
  }

  try {
    await saveMonthlyPlan(supabase, user.id, mes, {
      ingresoNetoMensual,
      ahorroMetaMonto: typeof ahorroMetaMonto === 'number' && ahorroMetaMonto >= 0 ? ahorroMetaMonto : 0,
    })
    return ok({ ok: true })
  } catch (e) {
    console.error('[PUT /api/monthly-plan]', { userId: user.id, mes }, e)
    return err('Error guardando el plan mensual')
  }
})
