import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { completeTourInDB } from '@/lib/services/settingsService'

export const POST = withAuth(async (_req, user, supabase) => {
  try {
    await completeTourInDB(supabase, user.id)
    return ok({ success: true })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Error al guardar tour')
  }
})
