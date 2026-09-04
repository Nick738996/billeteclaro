import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { getOrCreateForwardingAddress } from '@/lib/services/forwardingService'
import { createAdminClient } from '@/lib/supabase/server'

const FORWARD_DOMAIN = process.env.FORWARD_DOMAIN ?? 'billeteclaro.com'

// GET — el wizard de onboarding hace poll acá mientras espera que se
// confirme el reenvío (ver lib/services/forwardingService.ts::tryAutoConfirm).
export const GET = withAuth(async (_req, user) => {
  try {
    const addr = await getOrCreateForwardingAddress(createAdminClient(), user.id)
    return ok({
      email: `${addr.token}@${FORWARD_DOMAIN}`,
      confirmed: !!addr.confirmed_at,
      pendingConfirmUrl: addr.pending_confirm_url,
    })
  } catch (e) {
    console.error('[GET /api/forwarding/status]', { userId: user.id }, e)
    return err('No se pudo obtener tu dirección de reenvío')
  }
})
