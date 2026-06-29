import type { Banco } from '@/lib/types'
import type { EmailInput, ParseResult } from './types'
import { parseRappiCard } from './rappicard'
import { parseRappiPay } from './rappipay'
import { parseBancolombia } from './bancolombia'
import { parseUniversal } from './universal'

const PARSERS: Partial<Record<Banco, (email: EmailInput) => ParseResult>> = {
  RAPPICARD:   parseRappiCard,
  RAPPIPAY:    parseRappiPay,
  BANCOLOMBIA: parseBancolombia,
  OTRO:        parseUniversal,
}

export function trySpecificParser(
  banco: Banco,
  email: EmailInput
): ParseResult {
  const parser = PARSERS[banco]
  if (!parser) return null

  try {
    return parser(email)
  } catch (err) {
    console.error(`Parser error for ${banco}:`, err)
    return null
  }
}

export type { EmailInput, ParseResult }
