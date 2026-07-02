import { google } from 'googleapis'
import type { Banco } from '@/lib/types'
import type { EmailMessage, EmailProvider } from './types'

export const BANK_SENDERS: Record<string, Banco> = {
  // Rappi
  'noreply@rappicard.co':                                        'RAPPICARD',
  'noreply@rappipay.co':                                         'RAPPIPAY',
  'noreply@holdingrappipay.co':                                  'RAPPIPAY',

  // Bancolombia
  'alertasynotificaciones@an.notificacionesbancolombia.com':     'BANCOLOMBIA',
  'alertasynotificaciones@notificacionesbancolombia.com':        'BANCOLOMBIA',

  // Davivienda
  'notificaciones@davivienda.com':                               'DAVIVIENDA',
  'alertas@davivienda.com':                                      'DAVIVIENDA',
  'davibankinforma@davibank.com':                                'DAVIVIENDA',

  // BBVA
  'alertas@bbva.com.co':                                         'BBVA',
  'notificaciones@bbva.com.co':                                  'BBVA',

  // Scotiabank Colpatria
  'notificaciones@colpatria.com':                                'SCOTIABANK_COLPATRIA',

  // Banco de Bogotá
  'alertas@bancodebogota.com.co':                                'BANCO_DE_BOGOTA',

  // Nu Colombia
  'no-reply@nu.com.co':                                          'NU',
  'notificaciones@nu.com.co':                                    'NU',

  // Nequi
  'no-reply@nequi.com.co':                                       'NEQUI',

  // Lulo Bank
  'notificaciones@lulobank.com':                                 'LULO_BANK',

  // Itaú
  'alertas@itau.co':                                             'ITAU',

  // Falabella
  'notificaciones@falabella.com.co':                             'FALABELLA',
}

// Senders usados en la query Gmail
const GMAIL_SENDER_QUERY = Object.keys(BANK_SENDERS)
  .map(s => `from:${s}`)
  .join(' OR ')

export function detectBank(fromHeader: string): Banco {
  const emailMatch = fromHeader.match(/<([^>]+)>/)
  const email = (emailMatch ? emailMatch[1] : fromHeader).toLowerCase().trim()
  return BANK_SENDERS[email] ?? 'OTRO'
}


export class GmailProvider implements EmailProvider {
  name = 'gmail' as const
  private _accessToken: string | null = null

  constructor(private gmailRefreshToken: string) {}

  async listBankMessageIds(since: Date): Promise<string[]> {
    const access = await this._ensureToken()
    const gmail = this._buildClient(access)

    const sinceStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, '0')}/${String(since.getDate()).padStart(2, '0')}`
    const query = `${GMAIL_SENDER_QUERY} after:${sinceStr}`
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

  async getMessage(id: string): Promise<EmailMessage> {
    const access = await this._ensureToken()
    const gmail = this._buildClient(access)

    const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    const msg = res.data
    const headers = msg.payload?.headers ?? []
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

    return {
      id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: extractBody(msg.payload).slice(0, 3000),
      provider: 'gmail',
    }
  }

  async isTokenValid(): Promise<boolean> {
    try {
      const access = await this._ensureToken()
      const gmail = this._buildClient(access)
      await gmail.users.getProfile({ userId: 'me' })
      return true
    } catch {
      return false
    }
  }

  async refreshToken(): Promise<string> {
    const { access_token } = await refreshGmailToken(this.gmailRefreshToken)
    this._accessToken = access_token
    return access_token
  }

  private async _ensureToken(): Promise<string> {
    if (!this._accessToken) {
      this._accessToken = await this.refreshToken()
    }
    return this._accessToken
  }

  private _buildClient(accessToken: string) {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    return google.gmail({ version: 'v1', auth })
  }
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

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64url').toString('utf-8')
    return payload.mimeType === 'text/html' ? stripHtml(decoded) : decoded
  }
  if (!payload.parts) return ''
  // Prefer HTML: bank notification emails put all financial details in the HTML part.
  // The plain text alternative is often just "View in browser" or an abbreviated fallback.
  const html = findPart(payload.parts, 'text/html')
  if (html) return stripHtml(html)
  const plain = findPart(payload.parts, 'text/plain')
  if (plain) return plain
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

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&uuml;/g, 'ü')
    .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s{2,}/g, ' ')
    .trim()
}
