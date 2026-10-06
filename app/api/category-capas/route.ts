import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import {
  getCustomCapaOverrides,
  saveCategoryCapa,
  resetCategoryCapa,
  deleteCustomCategory,
  isBuiltInCategoria,
} from '@/lib/services/layerService'
import type { Capa } from '@/lib/types'

const VALID_CAPAS = new Set<Capa>(['AHORRO', 'FIJO', 'VARIABLE'])

// GET /api/category-capas
// Las categorías que creó el usuario (la tabla guarda nombre + capa). Hoy se
// usa solo por los nombres: qué es fijo sale del plan del mes (capasDelPlan),
// no de aquí.
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
// Registra una categoría nueva (al crearla desde el selector o la hoja de
// Categorías, o al agregar un ítem al plan).
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

// DELETE /api/category-capas  body: { categoria }
// Built-in → restaura su capa por defecto (borra el override).
// Custom → elimina la categoría: sus transacciones pasan a OTRO.
export const DELETE = withAuth(async (req, user, supabase) => {
  const { categoria } = await req.json() as { categoria?: string }
  if (!categoria) return err('categoria es requerida', 400)

  try {
    if (isBuiltInCategoria(categoria)) {
      await resetCategoryCapa(supabase, user.id, categoria)
      return ok({ eliminada: false, movidas: 0 })
    }
    const movidas = await deleteCustomCategory(supabase, user.id, categoria)
    return ok({ eliminada: true, movidas })
  } catch (e) {
    console.error('[DELETE /api/category-capas]', { userId: user.id, categoria }, e)
    return err('Error eliminando la categoría')
  }
})
