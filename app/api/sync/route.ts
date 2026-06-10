import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/server'
import { runSync } from '@/lib/services/syncService'

// POST /api/sync
export const POST = withAuth(async (_req, user) => {
  const admin = createAdminClient()
  try {
    const result = await runSync(user.id, admin)
    return ok(result)
  } catch (e: unknown) {
    if (e instanceof Error && (e as Error & { status?: number }).status === 400) {
      return err(e.message, 400)
    }
    console.error('[POST /api/sync]', { userId: user.id }, e)
    return err('Error en la sincronización')
  }
})
