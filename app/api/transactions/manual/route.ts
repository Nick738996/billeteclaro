import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/server'
import { createManualTransactions } from '@/lib/services/transactionService'
import type { ManualTxInput } from '@/lib/services/transactionService'

// POST /api/transactions/manual  body: { items: ManualTxInput[] }
export const POST = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { items?: unknown[] }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return err('items requeridos', 400)
  }

  const validated = body.items.filter((i): i is ManualTxInput =>
    typeof i === 'object' && i !== null &&
    typeof (i as ManualTxInput).fecha    === 'string' &&
    typeof (i as ManualTxInput).monto    === 'number' && (i as ManualTxInput).monto > 0 &&
    typeof (i as ManualTxInput).categoria === 'string' &&
    typeof (i as ManualTxInput).tipo     === 'string' &&
    typeof (i as ManualTxInput).banco    === 'string'
  )
  if (!validated.length) return err('Ningún item válido', 400)

  const admin = createAdminClient()
  try {
    const count = await createManualTransactions(supabase, admin, user.id, validated)
    return ok({ ok: true, count })
  } catch (e) {
    console.error('[POST /api/transactions/manual]', { userId: user.id }, e)
    return err('Error guardando transacciones')
  }
})
