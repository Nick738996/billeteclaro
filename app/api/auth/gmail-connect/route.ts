import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail-callback`
  )

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  })

  return NextResponse.redirect(url)
}
