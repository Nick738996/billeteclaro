import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { completeOnboarding } from '@/lib/services/settingsService'

export const POST = withAuth(async (_req, user, supabase) => {
  try {
    await completeOnboarding(supabase, user.id)
    return ok({ completed: true })
  } catch (e) {
    console.error('[POST /api/onboarding/complete]', { userId: user.id }, e)
    return err('Error al guardar configuración')
  }
})
