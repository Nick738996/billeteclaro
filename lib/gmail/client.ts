import { google } from 'googleapis'
import type { Banco } from '@/lib/types'

const BANK_SENDERS: Record<string, Banco> = {
  'noreply@rappicard.co': 'RAPPICARD',
  'noreply@rappipay.co': 'RAPPICARD',
  'noreply@holdingrappipay.co': 'RAPPICARD',
  'alertas@notificacionesbancolombia.com': 'BANCOLOMBIA',
  'alertas@bancolombia.com.co': 'BANCOLOMBIA',
  'no-reply@nu.com.co': 'NU',
  'notificaciones@nu.com.co': 'NU',
}

const BANK_SENDER_PATTERNS: Array<[RegExp, Banco]> = [
  [/@nequi\.com\.co$/i, 'NEQUI'],
  [/@daviplata\.com$/i, 'DAVIPLATA'],
  [/@bbva\.com\.co$/i, 'BBVA'],
  [/@davivienda\.com$/i, 'DAVIVIENDA'],
]

const GMAIL_SEARCH_QUERY = [
  'from:noreply@rappicard.co',
  'from:noreply@rappipay.co',
  'from:noreply@holdingrappipay.co',
  'from:alertas@notificacionesbancolombia.com',
  'from:alertas@bancolombia.com.co',
  'from:no-reply@nu.com.co',
  'from:notificaciones@nu.com.co',
].join(' OR ')

export function detectBank(fromHeader: string): Banco {
  const emailMatch = fromHeader.match(/<([^>]+)>/)
  const email = (emailMatch ? emailMatch[1] : fromHeader).toLowerCase().trim()

  if (BANK_SENDERS[email]) return BANK_SENDERS[email]

  for (const [pattern, banco] of BANK_SENDER_PATTERNS) {
    if (pattern.test(email)) return banco
  }

  return 'OTRO'
}

export async function refreshGmailToken(refreshToken: string): Promise<{
  access_token: string
  expires_at: Date
}> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2.setCredentials({ refresh_token: refreshToken })

  const { credentials } = await oauth2.refreshAccessToken()

  return {
    access_token: credentials.access_token!,
    expires_at: new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000),
  }
}

export function buildGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: 'v1', auth })
}

export async function listBankMessageIds(
  gmail: ReturnType<typeof buildGmailClient>,
  daysBack = 90
): Promise<string[]> {
  const query = `{${GMAIL_SEARCH_QUERY}} newer_than:${daysBack}d`
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 500,
      pageToken,
    })

    const messages = res.data.messages ?? []
    ids.push(...messages.map((m) => m.id!))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken && ids.length < 2000)

  return ids
}

export async function getMessageDetails(
  gmail: ReturnType<typeof buildGmailClient>,
  messageId: string
): Promise<{
  id: string
  from: string
  subject: string
  date: string
  body: string
  banco: Banco
}> {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const msg = res.data
  const headers = msg.payload?.headers ?? []

  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

  const from = getHeader('From')
  const subject = getHeader('Subject')
  const date = getHeader('Date')
  const body = extractBody(msg.payload)

  return {
    id: messageId,
    from,
    subject,
    date,
    body,
    banco: detectBank(from),
  }
}

function extractBody(payload: any): string {
  if (!payload) return ''

  // Simple (no parts)
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64url').toString('utf-8')
    return payload.mimeType === 'text/html' ? stripHtml(decoded) : decoded
  }

  if (!payload.parts) return ''

  // Search for text/plain first, then text/html
  const plain = findPart(payload.parts, 'text/plain')
  if (plain) return plain

  const html = findPart(payload.parts, 'text/html')
  if (html) return stripHtml(html)

  return ''
}

function findPart(parts: any[], mimeType: string): string | null {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf-8')
    }
    if (part.parts) {
      const found = findPart(part.parts, mimeType)
      if (found) return found
    }
  }
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
