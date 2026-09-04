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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Defensa en profundidad contra CSRF: para métodos que mutan estado, exige que
 * `Origin` (o `Referer` como fallback) coincida con el dominio de la app.
 * Las cookies de sesión de Supabase ya son `SameSite=Lax`, esto es una capa extra.
 */
function getAllowedOrigins(): Set<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return new Set()

  const { protocol, host } = new URL(appUrl)
  // Con y sin "www." son ambos dominios de producción válidos (ver CLAUDE.md) —
  // NEXT_PUBLIC_APP_URL solo configura uno, así que derivamos el otro para no
  // bloquear tráfico legítimo del host que no coincide exactamente.
  const altHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`
  return new Set([`${protocol}//${host}`, `${protocol}//${altHost}`])
}

function hasTrustedOrigin(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true

  const allowedOrigins = getAllowedOrigins()
  if (allowedOrigins.size === 0) return true // sin config no podemos validar — no bloquear

  const origin = req.headers.get('origin') ?? req.headers.get('referer')
  if (!origin) return true // requests server-to-server (ej. cron) no siempre mandan Origin

  try {
    return allowedOrigins.has(new URL(origin).origin)
  } catch {
    return false
  }
}

/**
 * Wrapper que autentica la request y pasa user + supabase al handler.
 * Devuelve 401 si no hay sesión activa, 403 si el origen no es de confianza.
 *
 * Uso (sin params):  export const GET  = withAuth(async (req, user, supabase) => { ... })
 * Uso (con params):  export const DELETE = withAuth(async (req, user, supabase, { params }) => {
 *                      const { id } = await params!
 *                    })
 */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, ctx: Context = {}): Promise<Response> => {
    if (!hasTrustedOrigin(req)) return err('Forbidden', 403)
    const { user, supabase } = await getAuthUser()
    if (!user) return err('Unauthorized', 401)
    return handler(req, user, supabase, ctx)
  }
}
