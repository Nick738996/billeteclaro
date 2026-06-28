import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }

  const { session } = data
  const { provider_token, provider_refresh_token, user } = session
  const provider = user.app_metadata?.provider as string | undefined

  const admin = createAdminClient()

  // ── Flujo Microsoft (Azure) ──────────────────────────────────────────────
  if (provider === 'azure') {
    if (provider_refresh_token) {
      await admin.from('user_tokens').upsert({
        user_id: user.id,
        outlook_refresh_token: provider_refresh_token,
        updated_at: new Date().toISOString(),
      })
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Flujo Google (Gmail) ─────────────────────────────────────────────────
  if (provider_refresh_token) {
    await admin.from('user_tokens').upsert({
      user_id: user.id,
      gmail_access_token: provider_token ?? null,
      gmail_refresh_token: provider_refresh_token,
      token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    return NextResponse.redirect(new URL(next, request.url))
  }

  // Google sin refresh token — verificar si ya tenemos uno guardado
  const { data: existing } = await admin
    .from('user_tokens')
    .select('gmail_refresh_token')
    .eq('user_id', user.id)
    .single()

  if (existing?.gmail_refresh_token) {
    return NextResponse.redirect(new URL(next, request.url))
  }

  // Sin token en ningún lado — pedir permiso de Gmail
  return NextResponse.redirect(new URL('/api/auth/gmail-connect', request.url))
}
