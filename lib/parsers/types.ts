import type { ExtractedTransaction } from '@/lib/types'

export interface EmailInput {
  id: string
  from: string
  subject: string
  date: string
  body: string
}

export type ParseResult = ExtractedTransaction | null
export type Parser = (email: EmailInput) => ParseResult
