import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/server'
import { withdrawFromSavings, getSavingsAccounts } from '@/lib/services/savingsService'

// POST /api/savings/withdraw  body: { accountId, monto, nota? }
export const POST = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { accountId?: string; monto?: number; nota?: string }
  if (!body.accountId || typeof body.monto !== 'number' || body.monto <= 0) {
    return err('accountId y monto (> 0) son requeridos', 400)
  }

  const admin = createAdminClient()
  try {
    await withdrawFromSavings(supabase, admin, user.id, body.accountId, body.monto, body.nota)
    const accounts = await getSavingsAccounts(supabase, user.id)
    return ok({ accounts })
  } catch (e: unknown) {
    const status = (e as Error & { status?: number }).status
    if (status === 404) return err('Cuenta de ahorro no encontrada', 404)
    if (status === 400) return err((e as Error).message, 400)
    console.error('[POST /api/savings/withdraw]', { userId: user.id }, e)
    return err('Error retirando de la cuenta de ahorro')
  }
})
