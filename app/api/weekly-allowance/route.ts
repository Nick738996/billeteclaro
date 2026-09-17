import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { getLiveWeeklyStatus } from '@/lib/services/weeklyAllowanceService'
import { fetchMonthlyPlan } from '@/lib/services/monthlyPlanService'
import { toColombiaDate } from '@/lib/utils/mesContable'

// GET /api/weekly-allowance — estado vivo del Cupo Semanal para "hoy" (hora Colombia)
export const GET = withAuth(async (_req, user, supabase) => {
  const today = toColombiaDate(new Date().toISOString())
  try {
    const status = await getLiveWeeklyStatus(supabase, user.id, today)
    const plan = await fetchMonthlyPlan(supabase, user.id, status.mes)
    return ok({ status, hasPlan: !!plan })
  } catch (e) {
    console.error('[GET /api/weekly-allowance]', { userId: user.id }, e)
    return err('Error cargando el cupo semanal')
  }
})
