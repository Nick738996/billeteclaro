import { NextResponse } from 'next/server'

export async function GET() {
  const params = new URLSearchParams({
    client_id:     process.env.OUTLOOK_CLIENT_ID!,
    response_type: 'code',
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook-callback`,
    scope:         'Mail.Read offline_access',
    response_mode: 'query',
    prompt:        'consent',
  })

  return NextResponse.redirect(
    `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID ?? 'common'}/oauth2/v2.0/authorize?${params}`
  )
}
