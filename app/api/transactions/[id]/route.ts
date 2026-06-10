import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/server'
import { deleteTransaction } from '@/lib/services/transactionService'

// DELETE /api/transactions/[id]
export const DELETE = withAuth(async (_req, user, supabase, { params }) => {
  const { id } = await params!
  const admin = createAdminClient()
  try {
    await deleteTransaction(supabase, admin, user.id, id)
    return ok({ ok: true })
  } catch (e: unknown) {
    if (e instanceof Error && (e as Error & { status?: number }).status === 404) {
      return err('Not found', 404)
    }
    console.error('[DELETE /api/transactions/[id]]', { userId: user.id, id }, e)
    return err('Error eliminando transacción')
  }
})
