import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { GMAIL_STATE_COOKIE, readStateCookie } from '@/lib/auth/oauthState'
import { encryptToken } from '@/lib/utils/tokenCrypto'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const expectedState = readStateCookie(request, GMAIL_STATE_COOKIE)

  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set(GMAIL_STATE_COOKIE, '', { maxAge: 0, path: '/' })
    return response
  }

  if (error || !code) {
    return clearStateCookie(NextResponse.redirect(new URL('/dashboard?gmail_error=denied', request.url)))
  }

  // Protección CSRF: el `state` debe coincidir con el que generamos en /gmail-connect.
  // Sin esto, un atacante podría vincular su propio refresh_token a la cuenta de una
  // víctima logueada (login/account-linking CSRF) engañándola para abrir un callback
  // con un `code` que el atacante obtuvo de su propia cuenta.
  if (!state || !expectedState || state !== expectedState) {
    return clearStateCookie(NextResponse.redirect(new URL('/dashboard?gmail_error=invalid_state', request.url)))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return clearStateCookie(NextResponse.redirect(new URL('/', request.url)))
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail-callback`
  )

  try {
    const { tokens } = await oauth2.getToken(code)

    if (!tokens.refresh_token) {
      return clearStateCookie(NextResponse.redirect(new URL('/dashboard?gmail_error=no_token', request.url)))
    }

    const admin = createAdminClient()
    await admin.from('user_tokens').upsert({
      user_id: user.id,
      gmail_refresh_token: encryptToken(tokens.refresh_token),
      gmail_access_token: tokens.access_token ?? null,
      token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })

    return clearStateCookie(NextResponse.redirect(new URL('/dashboard', request.url)))
  } catch {
    return clearStateCookie(NextResponse.redirect(new URL('/dashboard?gmail_error=exchange_failed', request.url)))
  }
}
