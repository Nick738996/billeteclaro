import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { fetchBudgets, saveBudgets } from '@/lib/services/budgetService'
import type { BudgetSaveItem } from '@/lib/services/budgetService'
import type { Categoria } from '@/lib/types'

// GET /api/budgets?mes=YYYY-MM
export const GET = withAuth(async (req, user, supabase) => {
  const mes = new URL(req.url).searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)
  try {
    const budgets = await fetchBudgets(supabase, user.id, mes)
    return ok({ mes, budgets })
  } catch (e) {
    console.error('[GET /api/budgets]', { userId: user.id, mes }, e)
    return err('Error cargando presupuestos')
  }
})

// PUT /api/budgets  body: { mes, items: BudgetSaveItem[] }
export const PUT = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { mes?: string; items?: unknown[] }
  const { mes, items } = body

  if (!mes || !Array.isArray(items)) return err('mes e items son requeridos', 400)

  const validated = items.filter(
    (i): i is BudgetSaveItem =>
      typeof i === 'object' && i !== null &&
      typeof (i as BudgetSaveItem).categoria === 'string' &&
      typeof (i as BudgetSaveItem).monto === 'number'
  ).map(i => ({
    categoria: i.categoria as Categoria,
    monto: i.monto,
    subcategorias: Array.isArray(i.subcategorias) ? i.subcategorias : [],
  }))

  try {
    await saveBudgets(supabase, user.id, mes, validated)
    return ok({ ok: true })
  } catch (e) {
    console.error('[PUT /api/budgets]', { userId: user.id, mes }, e)
    return err('Error guardando presupuestos')
  }
})
