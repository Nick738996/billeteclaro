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
    const status = e instanceof Error ? (e as Error & { status?: number }).status : undefined
    if (status === 400 || status === 429) {
      return err(e instanceof Error ? e.message : 'Error en la sincronización', status)
    }
    console.error('[POST /api/sync]', { userId: user.id }, e)
    return err('Error en la sincronización')
  }
})
