import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface MicrosoftTokenResponse {
  access_token?: string
  refresh_token?: string
  error?: string
  error_description?: string
}

export async function GET(request: Request) {
  const url  = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code) {
    console.error('[outlook-callback] OAuth error:', error, url.searchParams.get('error_description'))
    return NextResponse.redirect(new URL('/?error=outlook_denied', request.url))
  }

  console.log('[outlook-callback] code received, length:', code.length)

  // Verificar sesión de Supabase activa
  const supabase = await createClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  console.log('[outlook-callback] supabase user:', user?.id ?? 'NULL', 'error:', userErr?.message ?? 'none')
  if (!user) {
    console.error('[outlook-callback] No Supabase session — redirecting to /')
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Intercambiar código directamente con Microsoft
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook-callback`
  console.log('[outlook-callback] exchanging code, redirect_uri:', redirectUri)

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID ?? 'common'}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.OUTLOOK_CLIENT_ID!,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
        code,
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
        scope:         'Mail.Read offline_access',
      }),
    }
  )

  const tokenData = await tokenRes.json() as MicrosoftTokenResponse
  console.log('[outlook-callback] token response status:', tokenRes.status,
    'access_token:', tokenData.access_token ? 'present' : 'NULL',
    'refresh_token:', tokenData.refresh_token ? 'present' : 'NULL',
    'error:', tokenData.error ?? 'none',
    'error_description:', tokenData.error_description ?? 'none'
  )

  if (!tokenData.refresh_token) {
    console.error('[outlook-callback] No refresh_token — redirecting to /?error=outlook_no_token')
    return NextResponse.redirect(new URL('/?error=outlook_no_token', request.url))
  }

  const admin = createAdminClient()
  const { error: upsertErr } = await admin.from('user_tokens').upsert({
    user_id:               user.id,
    outlook_refresh_token: tokenData.refresh_token,
    updated_at:            new Date().toISOString(),
  })

  if (upsertErr) {
    console.error('[outlook-callback] upsert error:', upsertErr.message, upsertErr.code)
    return NextResponse.redirect(new URL('/?error=outlook_save_failed', request.url))
  }

  console.log('[outlook-callback] ✅ token saved for user', user.id)
  return NextResponse.redirect(new URL('/dashboard', request.url))
}
