import type { User, SupabaseClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { err } from './response'

type Context = { params?: Promise<Record<string, string>> }

type AuthedHandler = (
  req: Request,
  user: User,
  supabase: SupabaseClient,
  ctx: Context
) => Promise<Response>

/**
 * Wrapper que autentica la request y pasa user + supabase al handler.
 * Devuelve 401 si no hay sesión activa.
 *
 * Uso (sin params):  export const GET  = withAuth(async (req, user, supabase) => { ... })
 * Uso (con params):  export const DELETE = withAuth(async (req, user, supabase, { params }) => {
 *                      const { id } = await params!
 *                    })
 */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, ctx: Context = {}): Promise<Response> => {
    const { user, supabase } = await getAuthUser()
    if (!user) return err('Unauthorized', 401)
    return handler(req, user, supabase, ctx)
  }
}
