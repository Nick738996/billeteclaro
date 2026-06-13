import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // API routes — skip routing logic entirely
  if (pathname.startsWith('/api/')) return supabaseResponse

  // Unauthenticated: protect dashboard and onboarding
  if (!user) {
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return supabaseResponse
  }

  // Authenticated: check onboarding status
  const { data: settings } = await supabase
    .from('user_settings')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .single()

  const completed = settings?.onboarding_completed ?? false

  // / → send to right place
  if (pathname === '/') {
    return NextResponse.redirect(new URL(completed ? '/dashboard' : '/onboarding', request.url))
  }

  // /onboarding → if already completed, skip to dashboard
  if (pathname.startsWith('/onboarding') && completed) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // /dashboard → if onboarding not done, send there first
  if (pathname.startsWith('/dashboard') && !completed) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|apple-icon.png|og|sitemap.xml|robots.txt|manifest.json|sw.js|workbox-.*\\.js|google.*\\.html).*)',
  ],
}
