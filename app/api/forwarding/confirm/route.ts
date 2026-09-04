import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/server'

// POST — el usuario confirma a mano que ya verificó el reenvío desde su
// propio navegador (el link de confirmación de Google/Outlook no se puede
// completar de forma confiable con un fetch servidor-a-servidor — ver
// lib/services/forwardingService.ts::tryAutoConfirm).
export const POST = withAuth(async (_req, user) => {
  const admin = createAdminClient()
  const { error } = await admin
    .from('forwarding_addresses')
    .update({ confirmed_at: new Date().toISOString(), pending_confirm_url: null })
    .eq('user_id', user.id)

  if (error) {
    console.error('[POST /api/forwarding/confirm]', { userId: user.id }, error)
    return err('No se pudo confirmar')
  }
  return ok({ confirmed: true })
})
