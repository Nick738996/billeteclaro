import type { EmailInput, ParseResult } from './types'
import type { Categoria, TipoTransaccion } from '@/lib/types'

// Parses RappiCard / RappiPay transaction notification emails
export function parseRappiCard(email: EmailInput): ParseResult {
  const body = email.body
  const subject = email.subject.toLowerCase()

  // Only handle purchase/transaction notifications
  if (!isTransactionEmail(subject, body)) return null

  const monto = extractAmount(body)
  if (!monto) return null

  const comercio = extractMerchant(body)
  const tipo = detectTipo(subject, body)
  const fecha = extractDate(email.date)
  const label = email.from.includes('rappipay') || email.from.includes('holdingrappipay')
    ? 'RappiPay'
    : 'RappiCard'

  return {
    fecha,
    monto,
    comercio,
    descripcion: comercio ? `${comercio} — ${label}` : `Transacción ${label}`,
    banco: 'RAPPICARD',
    tipo,
    categoria: guessCategoria(comercio ?? ''),
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function isTransactionEmail(subject: string, body: string): boolean {
  const keywords = [
    'compra', 'compraste', 'realizaste', 'transacción', 'pago',
    'transferencia', 'retiro', 'cargo', 'abono',
  ]
  return keywords.some((k) => subject.includes(k) || body.toLowerCase().includes(k))
}

function extractAmount(body: string): number | null {
  // Patterns: $45,000  |  $45.000  |  45000  COP
  const patterns = [
    /\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{2})?)/,
    /COP\s*([\d]{1,3}(?:[.,][\d]{3})*)/i,
    /valor[:\s]+([\d]{1,3}(?:[.,][\d]{3})*)/i,
    /monto[:\s]+([\d]{1,3}(?:[.,][\d]{3})*)/i,
  ]

  for (const pattern of patterns) {
    const match = body.match(pattern)
    if (match) {
      return parseCOPAmount(match[1])
    }
  }

  return null
}

function parseCOPAmount(raw: string): number {
  // Handle both comma and period as thousand separators
  // Colombian format uses . for thousands, , for decimals
  // But emails sometimes use comma for thousands
  const cleaned = raw.replace(/\./g, '').replace(/,/g, '')
  return parseInt(cleaned, 10)
}

function extractMerchant(body: string): string | null {
  const patterns = [
    /en\s+([A-Z][A-Za-z0-9\s\-&.]+?)(?:\s+con|\s+por|\s*\n|\s*\r|$)/,
    /establecimiento[:\s]+([A-Za-z0-9\s\-&.]+?)(?:\n|\r|$)/i,
    /comercio[:\s]+([A-Za-z0-9\s\-&.]+?)(?:\n|\r|$)/i,
    /compra\s+en\s+([A-Za-z0-9\s\-&.]+?)(?:\n|\r|$)/i,
  ]

  for (const pattern of patterns) {
    const match = body.match(pattern)
    if (match) {
      return match[1].trim().slice(0, 100)
    }
  }

  return null
}

function detectTipo(subject: string, body: string): TipoTransaccion {
  const text = (subject + ' ' + body).toLowerCase()
  if (text.includes('transferencia') && text.includes('enviaste')) return 'TRANSFERENCIA_ENVIADA'
  if (text.includes('transferencia') && text.includes('recibiste')) return 'TRANSFERENCIA_RECIBIDA'
  if (text.includes('retiro')) return 'RETIRO'
  if (text.includes('pago') && (text.includes('servicio') || text.includes('factura'))) return 'PAGO_SERVICIO'
  if (text.includes('abono') || text.includes('pago a tarjeta')) return 'ABONO_DEUDA'
  return 'COMPRA'
}

function extractDate(dateHeader: string): string {
  try {
    return new Date(dateHeader).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function guessCategoria(comercio: string): Categoria {
  const c = comercio.toLowerCase()

  if (/uber|cabify|didi|indriver|taxi|transmilenio|sitp|gasolina|gasolinera/.test(c)) return 'TRANSPORTE'
  if (/rappi|domicilio|delivery|restaurante|cafe|café|bar|club|cine|evento/.test(c)) return 'SALIDAS'
  if (/farmacia|drogueria|droguería|médico|medico|clinic|hospital|gym|gimnasio|veterinar/.test(c)) return 'SALUD'
  if (/netflix|spotify|disney|hbo|prime|apple|claude|adobe|microsoft|google.*one/.test(c)) return 'SUSCRIPCIONES'
  if (/temu|amazon|mercadolibre|shein|falabella|éxito|alkosto/.test(c)) return 'COMPRAS_ONLINE'
  if (/claro|movistar|tigo|etb|epm|codensa|gases/.test(c)) return 'HOGAR'
  if (/cdt|fondo|inversión|bóveda|bolsa|crypto/.test(c)) return 'INVERSION'
  if (/iglesia|fundacion|fundación|world vision/.test(c)) return 'DONACIONES'
  if (/universidad|colegio|curso|plataforma.*edu/.test(c)) return 'EDUCACION'

  return 'OTRO'
}
