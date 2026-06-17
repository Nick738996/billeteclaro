import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { getSavingsAccounts, saveSavingsAccounts } from '@/lib/services/savingsService'

// GET /api/savings
export const GET = withAuth(async (_req, user, supabase) => {
  try {
    const accounts = await getSavingsAccounts(supabase, user.id)
    return ok({ accounts })
  } catch (e) {
    console.error('[GET /api/savings]', { userId: user.id }, e)
    return err('Error cargando cuentas de ahorro')
  }
})

// PUT /api/savings  body: { accounts: [{ nombre, saldo, color }] }
export const PUT = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { accounts?: unknown[] }
  if (!Array.isArray(body.accounts)) return err('accounts requeridos', 400)

  type Raw = { nombre?: unknown; saldo?: unknown; color?: unknown }
  const validated = (body.accounts as Raw[])
    .filter(a => typeof a === 'object' && a !== null && typeof a.nombre === 'string')
    .map((a, i) => ({
      nombre: (a.nombre as string).trim(),
      saldo:  Math.max(0, Number(a.saldo) || 0),
      color:  typeof a.color === 'string' ? a.color : '#4ADE80',
      orden:  i,
    }))
    .filter(a => a.nombre.length > 0)

  try {
    await saveSavingsAccounts(supabase, user.id, validated)
    return ok({ ok: true })
  } catch (e) {
    console.error('[PUT /api/savings]', { userId: user.id }, e)
    return err('Error guardando cuentas de ahorro')
  }
})
