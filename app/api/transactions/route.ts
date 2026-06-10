import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  fetchMonthTransactions,
  patchTransaction,
  deleteAllTransactions,
} from '@/lib/services/transactionService'
import type { Categoria } from '@/lib/types'

// GET /api/transactions?month=YYYY-MM
export const GET = withAuth(async (req, user, supabase) => {
  const mes = new URL(req.url).searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  try {
    const data = await fetchMonthTransactions(supabase, user.id, mes)
    return ok(data)
  } catch (e) {
    console.error('[GET /api/transactions]', { userId: user.id, mes }, e)
    return err('Error cargando transacciones')
  }
})

// PATCH /api/transactions  body: { id, categoria?, subcategoria?, comercio? }
export const PATCH = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { id?: string; categoria?: Categoria; subcategoria?: string; comercio?: string }
  if (!body.id) return err('id es requerido', 400)

  const updates: Record<string, unknown> = {}
  if (body.categoria    !== undefined) updates.categoria    = body.categoria
  if (body.subcategoria !== undefined) updates.subcategoria = body.subcategoria
  if (body.comercio     !== undefined) updates.comercio     = body.comercio

  try {
    const data = await patchTransaction(supabase, user.id, body.id, updates)
    return ok(data)
  } catch (e) {
    console.error('[PATCH /api/transactions]', { userId: user.id, id: body.id }, e)
    return err('Error actualizando transacción')
  }
})

// DELETE /api/transactions  — borra TODAS las del usuario (reset desde HeaderPill)
export const DELETE = withAuth(async (_req, user) => {
  const admin = createAdminClient()
  try {
    await deleteAllTransactions(admin, user.id)
    return ok({ ok: true })
  } catch (e) {
    console.error('[DELETE /api/transactions]', { userId: user.id }, e)
    return err('Error borrando transacciones')
  }
})
