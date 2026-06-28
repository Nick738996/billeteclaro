export type EmailMessage = {
  id: string
  from: string
  subject: string
  date: string
  body: string
  provider: 'gmail' | 'outlook'
}

export type EmailProvider = {
  name: 'gmail' | 'outlook'
  listBankMessageIds(since: Date): Promise<string[]>
  getMessage(id: string): Promise<EmailMessage>
  isTokenValid(): Promise<boolean>
  refreshToken(): Promise<string>
}
