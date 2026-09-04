export type EmailMessage = {
  id: string
  from: string
  subject: string
  date: string
  body: string
  provider: 'gmail' | 'outlook'
  /** true si el correo pasó SPF o DKIM según el proveedor — el header `From` por sí solo es falsificable. */
  authenticated: boolean
}

export type EmailProvider = {
  name: 'gmail' | 'outlook'
  listBankMessageIds(since: Date): Promise<string[]>
  getMessage(id: string): Promise<EmailMessage>
  isTokenValid(): Promise<boolean>
  refreshToken(): Promise<string>
}
