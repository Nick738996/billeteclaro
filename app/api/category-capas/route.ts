import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { saveCategoryCapa } from '@/lib/services/layerService'
import type { Capa } from '@/lib/types'

const VALID_CAPAS = new Set<Capa>(['AHORRO', 'FIJO', 'VARIABLE'])

// POST /api/category-capas  body: { categoria, capa }
// Reclasifica una categoría (built-in o custom) a una capa específica —
// usado por BudgetManager al crear una categoría custom en la sección de
// Gastos Fijos, para que computeMonthlyPlan la cuente como compromiso fijo
// en vez de asumir VARIABLE (el default para una categoría sin clasificar).
export const POST = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { categoria?: string; capa?: string }
  const { categoria, capa } = body

  if (!categoria || !capa || !VALID_CAPAS.has(capa as Capa)) {
    return err('categoria y capa (AHORRO|FIJO|VARIABLE) son requeridos', 400)
  }

  try {
    await saveCategoryCapa(supabase, user.id, categoria, capa as Capa)
    return ok({ ok: true })
  } catch (e) {
    console.error('[POST /api/category-capas]', { userId: user.id, categoria, capa }, e)
    return err('Error guardando la capa de la categoría')
  }
})
