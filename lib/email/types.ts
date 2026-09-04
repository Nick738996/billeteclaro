export type EmailMessage = {
  id: string
  from: string
  subject: string
  date: string
  body: string
  provider: 'forwarded'
  /**
   * La confianza no viene de SPF/DKIM del reenvío sino de que la dirección de
   * reenvío ya fue confirmada (ver lib/services/forwardingService.ts) —
   * siempre `true`.
   */
  authenticated: boolean
}
