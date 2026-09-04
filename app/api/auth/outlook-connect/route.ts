import { NextResponse } from 'next/server'
import { OUTLOOK_STATE_COOKIE, OUTLOOK_CONNECT_NEXT_COOKIE, generateOAuthState, sanitizeNextPath } from '@/lib/auth/oauthState'

// Conectar Outlook para sincronizar — acción explícita y separada del login
// (que hoy solo pide identidad). El usuario llega aquí desde un botón, no
// automáticamente.
export async function GET(request: Request) {
  const next = sanitizeNextPath(new URL(request.url).searchParams.get('next'), '/dashboard')
  const state = generateOAuthState()

  const params = new URLSearchParams({
    client_id:     process.env.OUTLOOK_CLIENT_ID!,
    response_type: 'code',
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook-callback`,
    scope:         'Mail.Read offline_access',
    response_mode: 'query',
    prompt:        'consent',
    state,
  })

  const response = NextResponse.redirect(
    `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID ?? 'common'}/oauth2/v2.0/authorize?${params}`
  )
  response.cookies.set(OUTLOOK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  response.cookies.set(OUTLOOK_CONNECT_NEXT_COOKIE, next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
