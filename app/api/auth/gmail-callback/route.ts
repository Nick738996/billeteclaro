import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/dashboard?gmail_error=denied', request.url))
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail-callback`
  )

  try {
    const { tokens } = await oauth2.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/dashboard?gmail_error=no_token', request.url))
    }

    const admin = createAdminClient()
    await admin.from('user_tokens').upsert({
      user_id: user.id,
      gmail_refresh_token: tokens.refresh_token,
      gmail_access_token: tokens.access_token ?? null,
      token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })

    return NextResponse.redirect(new URL('/dashboard', request.url))
  } catch {
    return NextResponse.redirect(new URL('/dashboard?gmail_error=exchange_failed', request.url))
  }
}
