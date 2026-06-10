import type { EmailInput, ParseResult } from './types'
import { parseSpanishDate, toTitleCase } from './utils'
import { guessCategoria } from './commerceCategories'

// ── Monto ──────────────────────────────────────────────────────────────────────
// Bancolombia usa dos formatos de monto:
//   $120,000.00  → coma = miles, punto = decimal  (norteamericano)
//   $6.790,00    → punto = miles, coma = decimal  (europeo / colombiano)
//   $130,000     → sin decimales (ambos formatos son válidos)
// Siempre retornamos entero — en COP no existen centavos reales.

export function parseMontoBancolombia(raw: string): number {
  const sinSigno = raw.replace(/\$/g, '').trim()

  const dotCount   = (sinSigno.match(/\./g) ?? []).length
  const commaCount = (sinSigno.match(/,/g) ?? []).length

  // Múltiples puntos → todos son separadores de miles
  if (dotCount > 1) {
    return Math.floor(parseFloat(sinSigno.replace(/\./g, '').replace(',', '.')))
  }

  // Múltiples comas → todas son separadores de miles
  if (commaCount > 1) {
    return Math.floor(parseFloat(sinSigno.replace(/,/g, '')))
  }

  const ultimaComa  = sinSigno.lastIndexOf(',')
  const ultimoPunto = sinSigno.lastIndexOf('.')

  if (ultimoPunto > ultimaComa) {
    // Un solo punto: decimal si ≤2 dígitos después, miles si 3
    const digitsAfterDot = sinSigno.length - ultimoPunto - 1
    if (digitsAfterDot <= 2) {
      // $120,000.00 — punto = decimal, coma = miles
      return Math.floor(parseFloat(sinSigno.replace(/,/g, '')))
    } else {
      // $10.254 — punto = miles
      return Math.floor(parseFloat(sinSigno.replace(/\./g, '')))
    }
  } else if (ultimaComa > ultimoPunto) {
    // Una sola coma: decimal si ≤2 dígitos después, miles si 3
    const digitsAfterComma = sinSigno.length - ultimaComa - 1
    if (digitsAfterComma <= 2) {
      // $6.790,00 — coma = decimal, punto = miles
      return Math.floor(parseFloat(sinSigno.replace(/\./g, '').replace(',', '.')))
    } else {
      // $130,000 — coma = miles
      return Math.floor(parseFloat(sinSigno.replace(/,/g, '')))
    }
  } else {
    // Sin separadores
    return Math.floor(parseFloat(sinSigno))
  }
}

// ── Parser principal ───────────────────────────────────────────────────────────

export function parseBancolombia(email: EmailInput): ParseResult {
  const subject = email.subject.toLowerCase()
  const body    = email.body

  if (/retiro|compra|pago|transacci[oó]n|transferencia/i.test(subject + ' ' + body)) {
    return parseMovimiento(email)
  }

  return null
}

function parseMovimiento(email: EmailInput): ParseResult {
  const body = email.body

  // Monto: "$ 120,000.00" o "$6.790,00"
  const montoMatch = body.match(/\$\s*([\d.,]+)/)
  if (!montoMatch) return null

  const monto = parseMontoBancolombia(montoMatch[1])
  if (!monto || monto <= 0) return null

  // Comercio / establecimiento
  const comercioMatch = body.match(/(?:establecimiento|comercio|descripci[oó]n)[:\s]+([^\n]{1,80})/i)
  const comercio = comercioMatch ? toTitleCase(comercioMatch[1].trim()) : null

  // Fecha: "dd/mm/yyyy" o "dd de mes de yyyy"
  let fecha: string | null = null
  const fechaSlashMatch = body.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (fechaSlashMatch) {
    const [, d, m, y] = fechaSlashMatch
    fecha = `${y}-${m}-${d}T00:00:00`
  } else {
    const fechaTextoMatch = body.match(/(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)
    if (fechaTextoMatch) fecha = parseSpanishDate(fechaTextoMatch[1])
  }

  // Tipo de transacción
  const bodyLow = body.toLowerCase()
  let tipo: ParseResult extends null ? never : NonNullable<ParseResult>['tipo'] = 'COMPRA'
  if (/retiro/i.test(bodyLow))                                      tipo = 'RETIRO'
  else if (/transferencia enviada|transfiri[oó]|enviaste/i.test(bodyLow)) tipo = 'TRANSFERENCIA_ENVIADA'
  else if (/transferencia recibida|recibiste/i.test(bodyLow))       tipo = 'TRANSFERENCIA_RECIBIDA'
  else if (/pago de servicio|recaudo/i.test(bodyLow))               tipo = 'PAGO_SERVICIO'

  return {
    fecha:       fecha ?? new Date(email.date).toISOString(),
    monto,
    comercio,
    descripcion: comercio ? `${tipo === 'COMPRA' ? 'Compra en' : 'Pago a'} ${comercio}` : 'Transacción Bancolombia',
    banco:       'BANCOLOMBIA',
    tipo,
    categoria:   guessCategoria(comercio ?? ''),
    subcategoria: null,
    moneda:      'COP',
    monto_usd:   null,
    flags:       [],
  }
}
