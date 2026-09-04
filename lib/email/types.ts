export type EmailMessage = {
  id: string
  from: string
  subject: string
  date: string
  body: string
  provider: 'gmail' | 'outlook' | 'forwarded'
  /**
   * true si el correo pasó SPF o DKIM según el proveedor (gmail/outlook) — el
   * header `From` por sí solo es falsificable. Para `provider: 'forwarded'`
   * la confianza no viene de SPF/DKIM del reenvío sino de que la dirección de
   * reenvío ya fue confirmada (ver lib/services/forwardingService.ts) —
   * siempre `true` en ese caso.
   */
  authenticated: boolean
}

export type EmailProvider = {
  name: 'gmail' | 'outlook'
  listBankMessageIds(since: Date): Promise<string[]>
  getMessage(id: string): Promise<EmailMessage>
  isTokenValid(): Promise<boolean>
  refreshToken(): Promise<string>
}
