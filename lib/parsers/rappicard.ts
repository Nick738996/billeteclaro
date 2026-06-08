import type { EmailInput, ParseResult } from './types'
import type { Categoria } from '@/lib/types'
import { parseCOPAmount, parseSpanishDate, parseISOLikeDate, toTitleCase } from './utils'

export function parseRappiCard(email: EmailInput): ParseResult {
  const body = email.body
  const subject = email.subject.toLowerCase()
  const combined = subject + ' ' + body.toLowerCase()

  // Pago de tarjeta (ABONO_DEUDA): "Comprobante de pago" / "pago de tu tarjeta"
  if (/comprobante de pago|pago de tu tarjeta|recibimos el pago/i.test(combined)) {
    return parsePayment(email)
  }

  // Compra: "Realizaste una compra" / "Detalle de tu transacción"
  if (/realizaste una compra|compra con tu rappicard|detalle de tu transacci/i.test(combined)) {
    return parsePurchase(email)
  }

  return null
}

function parsePurchase(email: EmailInput): ParseResult {
  const body = email.body

  // "Monto\n$17.934" → after stripping HTML becomes "Monto $17.934 Método..."
  const montoMatch = body.match(/\bMonto\s+\$([\d.,]+)/i)
  if (!montoMatch) return null

  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  // "Comercio\nUber\nFecha de la transacción" → "Comercio Uber Fecha de la transacción"
  const comercioMatch = body.match(/\bComercio\s+([^\n$]{1,80}?)(?=\s+(?:Fecha|¿|Escr|$))/i)
  const comercio = comercioMatch ? toTitleCase(comercioMatch[1].trim()) : null

  // "Fecha de la transacción\n2026-06-07 12:25:21"
  const fechaISOMatch = body.match(/Fecha de la transacci[oó]n\s+(\d{4}-\d{2}-\d{2}(?:[\sT]\d{2}:\d{2}(?::\d{2})?)?)/i)
  const fecha = fechaISOMatch
    ? parseISOLikeDate(fechaISOMatch[1])
    : new Date(email.date).toISOString()

  return {
    fecha: fecha ?? new Date(email.date).toISOString(),
    monto,
    comercio,
    descripcion: comercio ? `Compra en ${comercio}` : 'Compra RappiCard',
    banco: 'RAPPICARD',
    tipo: 'COMPRA',
    categoria: guessCategoria(comercio ?? ''),
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function parsePayment(email: EmailInput): ParseResult {
  const body = email.body

  // "Monto\n114.184,57" → no $ sign in payment emails
  const montoMatch = body.match(/\bMonto\s+\$?([\d.,]+)/i)
  if (!montoMatch) return null

  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  // "Fecha y hora\n04 jun 2026 15:20"
  const fechaMatch = body.match(/Fecha y hora\s+([\d]{1,2}\s+\w+\s+\d{4}\s+\d{2}:\d{2})/i)
  let fecha: string | null = null
  if (fechaMatch) {
    const parts = fechaMatch[1].trim().split(/\s+/)
    const timePart = parts.pop() ?? ''
    fecha = parseSpanishDate(parts.join(' '), timePart)
  }

  return {
    fecha: fecha ?? new Date(email.date).toISOString(),
    monto,
    comercio: 'RappiCard',
    descripcion: 'Pago tarjeta RappiCard',
    banco: 'RAPPICARD',
    tipo: 'ABONO_DEUDA',
    categoria: 'TRANSFERENCIA',
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function guessCategoria(comercio: string): Categoria {
  const c = comercio.toLowerCase()
  if (/uber|cabify|didi|indriver|taxi|transmilenio|sitp/.test(c)) return 'TRANSPORTE'
  if (/netflix|spotify|disney|hbo|prime|apple|claude|adobe|microsoft|google one|youtube/.test(c)) return 'SUSCRIPCIONES'
  if (/farmacia|drogueria|droguería|clinic|hospital|gym|gimnasio|salud|audifarma|cruz verde/.test(c)) return 'SALUD'
  if (/rappi\s*food|ifood|restaurante|cafe|café|bar|taberna|cine|pizza|burger|mcdonalds|kfc|subway/.test(c)) return 'SALIDAS'
  if (/temu|amazon|mercadolibre|shein|falabella|alkosto|linio/.test(c)) return 'COMPRAS_ONLINE'
  if (/claro|movistar|tigo|epm|codensa|gas natural|acueducto|electricidad|internet|directv|enel/.test(c)) return 'HOGAR'
  if (/exito|éxito|carulla|jumbo|olimpica|d1|ara|supermercado/.test(c)) return 'HOGAR'
  if (/cdt|fondo|inversión|inversion|bolsa|crypto|nu invest/.test(c)) return 'INVERSION'
  if (/iglesia|fundacion|world vision/.test(c)) return 'DONACIONES'
  if (/universidad|colegio|curso|platzi|udemy|coursera|duolingo/.test(c)) return 'EDUCACION'
  return 'OTRO'
}
