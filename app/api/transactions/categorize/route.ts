import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { batchCategorize } from '@/lib/services/transactionService'
import type { CategoryChange } from '@/lib/services/transactionService'
import type { Categoria } from '@/lib/types'

// PATCH /api/transactions/categorize  body: { changes: [{ id, categoria }] }
export const PATCH = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { changes?: unknown[] }
  if (!Array.isArray(body.changes) || body.changes.length === 0) {
    return err('changes requeridos', 400)
  }

  const validated = body.changes.filter((c): c is CategoryChange =>
    typeof c === 'object' && c !== null &&
    typeof (c as CategoryChange).id       === 'string' &&
    typeof (c as CategoryChange).categoria === 'string'
  ).map(c => ({ id: c.id, categoria: c.categoria as Categoria }))

  if (!validated.length) return err('Ningún cambio válido', 400)

  try {
    await batchCategorize(supabase, user.id, validated)
    return ok({ ok: true, updated: validated.length })
  } catch (e) {
    console.error('[PATCH /api/transactions/categorize]', { userId: user.id }, e)
    return err('Error categorizando transacciones')
  }
})
