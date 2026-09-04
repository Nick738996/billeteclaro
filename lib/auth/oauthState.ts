import { randomBytes } from 'crypto'

export const GMAIL_STATE_COOKIE = 'gmail_oauth_state'
export const OUTLOOK_STATE_COOKIE = 'outlook_oauth_state'

// Adónde volver una vez el usuario conecta su correo (conectar es una acción
// separada del login — ver gmail-connect/outlook-connect) — mismo patrón de
// cookie de un solo uso que las de state, solo que esta no es secreta.
export const GMAIL_CONNECT_NEXT_COOKIE = 'gmail_connect_next'
export const OUTLOOK_CONNECT_NEXT_COOKIE = 'outlook_connect_next'

export function generateOAuthState(): string {
  return randomBytes(32).toString('hex')
}

export function readStateCookie(request: Request, cookieName: string): string | undefined {
  const cookieHeader = request.headers.get('cookie') ?? ''
  return cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1)
}

// Solo permitimos rutas relativas internas con caracteres seguros (incluye
// query string simple) — evita que un `next` manipulado redirija a un host
// externo (open redirect) al volver de gmail-connect/outlook-connect o del
// callback de login.
export function sanitizeNextPath(raw: string | null | undefined, fallback: string): string {
  if (raw && /^\/(?!\/|\\)[A-Za-z0-9\-_/]*(?:\?[A-Za-z0-9=&_\-%.]*)?$/.test(raw)) return raw
  return fallback
}
