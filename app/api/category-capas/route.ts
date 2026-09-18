import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { getCustomCapaOverrides, saveCategoryCapa } from '@/lib/services/layerService'
import type { Capa } from '@/lib/types'

const VALID_CAPAS = new Set<Capa>(['AHORRO', 'FIJO', 'VARIABLE'])

// GET /api/category-capas
// Overrides de capa del usuario (categorías custom o built-in reclasificadas)
// — usado por CategoriesCard para clasificar correctamente el gasto real de
// cada transacción por capa; sin esto, una categoría custom marcada Fijo al
// crearla (ver POST abajo) se seguía viendo como Variable en el gasto real.
export const GET = withAuth(async (_req, user, supabase) => {
  try {
    const overrides = await getCustomCapaOverrides(supabase, user.id)
    return ok({ overrides })
  } catch (e) {
    console.error('[GET /api/category-capas]', { userId: user.id }, e)
    return err('Error cargando las capas de categorías')
  }
})

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
