import type { Banco } from '@/lib/types'
import type { EmailInput, ParseResult } from './types'
import { parseRappiCard } from './rappicard'
import { parseRappiPay } from './rappipay'
import { parseBancolombia } from './bancolombia'
import { parseUniversal } from './universal'

const PARSERS: Partial<Record<Banco, (email: EmailInput) => ParseResult>> = {
  RAPPICARD:            parseRappiCard,
  RAPPIPAY:             parseRappiPay,
  BANCOLOMBIA:          parseBancolombia,
  DAVIVIENDA:           parseUniversal,
  BBVA:                 parseUniversal,
  SCOTIABANK_COLPATRIA: parseUniversal,
  BANCO_DE_BOGOTA:      parseUniversal,
  NU:                   parseUniversal,
  NEQUI:                parseUniversal,
  LULO_BANK:            parseUniversal,
  ITAU:                 parseUniversal,
  FALABELLA:            parseUniversal,
  OTRO:                 parseUniversal,
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
