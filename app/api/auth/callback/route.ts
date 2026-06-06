import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url))
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }

  const { session } = data
  const { provider_token, provider_refresh_token, user } = session

  // Persist Gmail tokens for background syncing
  if (provider_refresh_token) {
    const admin = createAdminClient()
    await admin.from('user_tokens').upsert({
      user_id: user.id,
      gmail_access_token: provider_token ?? null,
      gmail_refresh_token: provider_refresh_token,
      token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  return NextResponse.redirect(new URL(next, request.url))
}
