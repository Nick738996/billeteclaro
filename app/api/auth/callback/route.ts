import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeNextPath } from '@/lib/auth/oauthState'

// Callback de login (Supabase) — solo identidad. Conectar Gmail/Outlook para
// sincronizar es una acción separada y explícita (ver gmail-connect /
// outlook-connect), nunca algo que el login otorgue de forma implícita.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = sanitizeNextPath(url.searchParams.get('next'), '/dashboard')

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }

  return NextResponse.redirect(new URL(next, request.url))
}
