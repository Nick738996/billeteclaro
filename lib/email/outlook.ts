// Requiere variables de entorno: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_TENANT_ID=common
// Requiere columna en user_tokens: outlook_refresh_token text
// Prerrequisito: registrar app en Azure Portal (ver CLAUDE.md sección PASO 3)
import type { EmailMessage, EmailProvider } from './types'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const BANK_SENDERS_OUTLOOK = [
  'noreply@rappicard.co',
  'noreply@rappipay.co',
  'noreply@holdingrappipay.co',
  'alertasynotificaciones@an.notificacionesbancolombia.com',
  'alertasynotificaciones@notificacionesbancolombia.com',
  'notificaciones@davivienda.com',
  'alertas@davivienda.com',
  'DAVIbankInforma@davibank.com',
  'alertas@bbva.com.co',
  'notificaciones@bbva.com.co',
  'notificaciones@colpatria.com',
  'alertas@bancodebogota.com.co',
  'no-reply@nu.com.co',
  'notificaciones@nu.com.co',
  'no-reply@nequi.com.co',
  'notificaciones@lulobank.com',
  'alertas@itau.co',
  'notificaciones@falabella.com.co',
]

export class OutlookProvider implements EmailProvider {
  name = 'outlook' as const
  private _accessToken: string | null = null

  constructor(private outlookRefreshToken: string) {}

  async listBankMessageIds(since: Date): Promise<string[]> {
    const access = await this._ensureToken()

    const senderFilter = BANK_SENDERS_OUTLOOK
      .map(s => `from/emailAddress/address eq '${s}'`)
      .join(' or ')

    const filter = `(${senderFilter}) and receivedDateTime ge ${since.toISOString()}`

    // Construir URL con URLSearchParams para encoding uniforme
    const base = new URL(`${GRAPH_BASE}/me/messages`)
    base.searchParams.set('$filter', filter)
    base.searchParams.set('$select', 'id,from,subject,receivedDateTime')
    base.searchParams.set('$top', '50')

    const ids: string[] = []
    let nextUrl: string | null = base.toString()

    while (nextUrl && ids.length < 2000) {
      const res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${access}` },
      })
      if (!res.ok) {
        const errText = await res.text()
        console.error('[OutlookProvider] list failed:', res.status, errText.slice(0, 300))
        throw new Error(`Outlook list failed: ${res.status}`)
      }
      const data = await res.json() as { value: { id: string }[]; '@odata.nextLink'?: string }
      ids.push(...data.value.map(m => m.id))
      nextUrl = data['@odata.nextLink'] ?? null
    }
    return ids
  }

  async getMessage(id: string): Promise<EmailMessage> {
    const access = await this._ensureToken()

    const res = await fetch(
      `${GRAPH_BASE}/me/messages/${id}?$select=id,from,subject,receivedDateTime,body`,
      { headers: { Authorization: `Bearer ${access}` } }
    )
    if (!res.ok) throw new Error(`Outlook getMessage failed: ${res.status}`)

    const msg = await res.json() as {
      id: string
      from: { emailAddress: { address: string } }
      subject: string
      receivedDateTime: string
      body: { content: string; contentType: string }
    }

    const rawBody = msg.body?.content ?? ''
    const body = msg.body?.contentType === 'html'
      ? stripHtml(rawBody).slice(0, 1000)
      : rawBody.slice(0, 1000)

    return {
      id: msg.id,
      from: msg.from?.emailAddress?.address ?? '',
      subject: msg.subject ?? '',
      date: msg.receivedDateTime ?? '',
      body,
      provider: 'outlook',
    }
  }

  async isTokenValid(): Promise<boolean> {
    try {
      const access = await this._ensureToken()
      const res = await fetch(`${GRAPH_BASE}/me?$select=id`, {
        headers: { Authorization: `Bearer ${access}` },
      })
      return res.ok
    } catch {
      return false
    }
  }

  async refreshToken(): Promise<string> {
    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID ?? 'common'}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.OUTLOOK_CLIENT_ID!,
          client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
          refresh_token: this.outlookRefreshToken,
          grant_type: 'refresh_token',
          scope: 'Mail.Read offline_access',
        }),
      }
    )
    const data = await res.json() as { access_token?: string; error?: string; error_description?: string }
    if (!data.access_token) {
      throw new Error(`Outlook token refresh failed: ${data.error_description ?? data.error}`)
    }
    this._accessToken = data.access_token
    return data.access_token
  }

  private async _ensureToken(): Promise<string> {
    if (!this._accessToken) {
      await this.refreshToken()
    }
    return this._accessToken!
  }
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
