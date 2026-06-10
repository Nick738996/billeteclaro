import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { getInsights } from '@/lib/services/advisorService'

// GET /api/ai/insights?mes=YYYY-MM[&force=true]
export const GET = withAuth(async (req, user, supabase) => {
  const params = new URL(req.url).searchParams
  const mes   = params.get('mes')   ?? new Date().toISOString().slice(0, 7)
  const force = params.get('force') === 'true'

  try {
    const result = await getInsights(supabase, user.id, mes, force)
    return ok(result)
  } catch (e: any) {
    if (e?.status === 429) return err('Límite diario de IA alcanzado — vuelve en unos minutos', 429)
    console.error('[GET /api/ai/insights]', { userId: user.id, mes }, e)
    return err('Error generando insights')
  }
})
