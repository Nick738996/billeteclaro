import type { EmailInput, ParseResult } from './types'
import { toTitleCase } from './utils'
import { guessCategoria } from './commerceCategories'

// ── Monto ──────────────────────────────────────────────────────────────────────
// Bancolombia usa dos formatos de monto:
//   $120,000.00  → coma=miles, punto=decimal  (norteamericano)
//   $6.790,00    → punto=miles, coma=decimal  (colombiano)
//   $130,000     → sin decimales
// Siempre retornamos entero — en COP no existen centavos reales.

export function parseMontoBancolombia(raw: string): number {
  const sinSigno = raw.replace(/\$/g, '').trim()

  const dotCount   = (sinSigno.match(/\./g) ?? []).length
  const commaCount = (sinSigno.match(/,/g) ?? []).length

  if (dotCount > 1) {
    return Math.floor(parseFloat(sinSigno.replace(/\./g, '').replace(',', '.')))
  }
  if (commaCount > 1) {
    return Math.floor(parseFloat(sinSigno.replace(/,/g, '')))
  }

  const ultimaComa  = sinSigno.lastIndexOf(',')
  const ultimoPunto = sinSigno.lastIndexOf('.')

  if (ultimoPunto > ultimaComa) {
    const digitsAfterDot = sinSigno.length - ultimoPunto - 1
    if (digitsAfterDot <= 2) {
      return Math.floor(parseFloat(sinSigno.replace(/,/g, '')))
    } else {
      return Math.floor(parseFloat(sinSigno.replace(/\./g, '')))
    }
  } else if (ultimaComa > ultimoPunto) {
    const digitsAfterComma = sinSigno.length - ultimaComa - 1
    if (digitsAfterComma <= 2) {
      return Math.floor(parseFloat(sinSigno.replace(/\./g, '').replace(',', '.')))
    } else {
      return Math.floor(parseFloat(sinSigno.replace(/,/g, '')))
    }
  } else {
    return Math.floor(parseFloat(sinSigno))
  }
}

function parseFecha(dd: string, mm: string, yyyy: string, hhmm?: string): string {
  const h = hhmm ? hhmm.slice(0, 2) : '00'
  const m = hhmm ? hhmm.slice(3, 5) : '00'
  return `${yyyy}-${mm}-${dd}T${h}:${m}:00`
}

// ── Parser principal ───────────────────────────────────────────────────────────
// Bancolombia envía notificaciones en formato de oración:
//   "Compraste $X en COMERCIO con tu T.Deb *XXXX, el DD/MM/YYYY a las HH:MM"
//   "Transferiste $X desde tu cuenta XXXX a la cuenta *XXXX el DD/MM/YYYY a las HH:MM"
//   "Recibiste una transferencia por $X de NOMBRE en tu cuenta **XXXX, el DD/MM/YYYY a las HH:MM"
//   "NOMBRE pagaste $X por codigo QR ... el DD/MM/YYYY a las HH:MM"

export function parseBancolombia(email: EmailInput): ParseResult {
  const body = email.body

  // Tipo 1: Compra con tarjeta débito o crédito
  // "Compraste $6.790,00 en UBER *TRIP con tu T.Deb *1754, el 18/04/2025 a las 14:05"
  const compraMatch = body.match(
    /Compraste\s+\$\s*([\d.,]+)\s+en\s+(.+?)\s+con tu\s+T\.[A-Za-z]+[^,]*,?\s+el\s+(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{2}:\d{2})/i
  )
  if (compraMatch) {
    const monto = parseMontoBancolombia(compraMatch[1])
    if (monto > 0) {
      const comercio = toTitleCase(compraMatch[2].replace(/\*/g, '').trim())
      return {
        fecha:        parseFecha(compraMatch[3], compraMatch[4], compraMatch[5], compraMatch[6]),
        monto,
        comercio,
        descripcion:  `Compra en ${comercio}`,
        banco:        'BANCOLOMBIA',
        tipo:         'COMPRA',
        categoria:    guessCategoria(comercio),
        subcategoria: null,
        moneda:       'COP',
        monto_usd:    null,
        flags:        [],
      }
    }
  }

  // Tipo 2: Transferencia enviada
  // "Transferiste $120,000.00 desde tu cuenta 2997 a la cuenta *3232989410 el 07/06/2026 a las 08:07"
  const transferisteMatch = body.match(
    /Transferiste\s+\$\s*([\d.,]+)\s+desde tu cuenta\s+\S+\s+a la cuenta\s+\S+\s+el\s+(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{2}:\d{2})/i
  )
  if (transferisteMatch) {
    const monto = parseMontoBancolombia(transferisteMatch[1])
    if (monto > 0) {
      return {
        fecha:        parseFecha(transferisteMatch[2], transferisteMatch[3], transferisteMatch[4], transferisteMatch[5]),
        monto,
        comercio:     null,
        descripcion:  'Transferencia enviada',
        banco:        'BANCOLOMBIA',
        tipo:         'TRANSFERENCIA_ENVIADA',
        categoria:    'TRANSFERENCIA',
        subcategoria: null,
        moneda:       'COP',
        monto_usd:    null,
        flags:        [],
      }
    }
  }

  // Tipo 3: Transferencia recibida
  // "Recibiste una transferencia por $130,000 de ERNESTO CASTELLANOS en tu cuenta **2997, el 06/06/2026 a las 10:59"
  const recibisteMatch = body.match(
    /Recibiste una transferencia por\s+\$\s*([\d.,]+)\s+de\s+([A-ZÁÉÍÓÚÜÑ\s]+?)\s+en tu cuenta\s+\S+[,\s]+el\s+(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{2}:\d{2})/i
  )
  if (recibisteMatch) {
    const monto = parseMontoBancolombia(recibisteMatch[1])
    if (monto > 0) {
      const comercio = toTitleCase(recibisteMatch[2].trim())
      return {
        fecha:        parseFecha(recibisteMatch[3], recibisteMatch[4], recibisteMatch[5], recibisteMatch[6]),
        monto,
        comercio,
        descripcion:  `Transferencia recibida de ${comercio}`,
        banco:        'BANCOLOMBIA',
        tipo:         'TRANSFERENCIA_RECIBIDA',
        categoria:    'TRANSFERENCIA',
        subcategoria: null,
        moneda:       'COP',
        monto_usd:    null,
        flags:        [],
      }
    }
  }

  // Tipo 4: Pago código QR
  // "BRANDON NICK GOMEZ AYA pagaste $6,000.00 por codigo QR desde tu cuenta *2997 a la llave 0091322191 el 25/05/2026 a las 16:16"
  const pagoQrMatch = body.match(
    /pagaste\s+\$\s*([\d.,]+)\s+por codigo QR\s+.*?el\s+(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{2}:\d{2})/i
  )
  if (pagoQrMatch) {
    const monto = parseMontoBancolombia(pagoQrMatch[1])
    if (monto > 0) {
      return {
        fecha:        parseFecha(pagoQrMatch[2], pagoQrMatch[3], pagoQrMatch[4], pagoQrMatch[5]),
        monto,
        comercio:     null,
        descripcion:  'Pago código QR',
        banco:        'BANCOLOMBIA',
        tipo:         'PAGO_SERVICIO',
        categoria:    'OTRO',
        subcategoria: null,
        moneda:       'COP',
        monto_usd:    null,
        flags:        [],
      }
    }
  }

  return null
}
