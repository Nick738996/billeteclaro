import { randomBytes } from 'crypto'

export const GMAIL_STATE_COOKIE = 'gmail_oauth_state'
export const OUTLOOK_STATE_COOKIE = 'outlook_oauth_state'

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
