import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { GMAIL_STATE_COOKIE, GMAIL_CONNECT_NEXT_COOKIE, generateOAuthState, sanitizeNextPath } from '@/lib/auth/oauthState'

// Conectar Gmail para sincronizar — acción explícita y separada del login
// (que hoy solo pide identidad). El usuario llega aquí desde un botón, no
// automáticamente.
export async function GET(request: Request) {
  const next = sanitizeNextPath(new URL(request.url).searchParams.get('next'), '/dashboard')
  const state = generateOAuthState()

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail-callback`
  )

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    state,
  })

  const response = NextResponse.redirect(url)
  response.cookies.set(GMAIL_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  response.cookies.set(GMAIL_CONNECT_NEXT_COOKIE, next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
