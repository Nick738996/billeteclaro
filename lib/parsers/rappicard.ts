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
  // Prioridad alta: patrones que aparecen junto al monto real de la transacción
  const contextPatterns = [
    /compraste\s+(?:por\s+)?\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i,
    /realizaste.*?(?:por|de)\s+\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i,
    /(?:valor|monto|total|importe)\s+(?:de\s+(?:tu\s+)?(?:compra|transacci[oó]n|pago|cargo)[:\s]+)?\$?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i,
    /por\s+(?:un\s+valor\s+de\s+)?\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i,
    /cargo\s+de\s+\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i,
    /COP\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/i,
  ]

  for (const pattern of contextPatterns) {
    const match = body.match(pattern)
    if (match) {
      const amount = parseCOPAmount(match[1])
      if (amount > 0) return amount
    }
  }

  // Fallback: primer $ del body (menos confiable — puede capturar saldo o cupo)
  const fallback = body.match(/\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{1,2})?)/)
  if (fallback) {
    const amount = parseCOPAmount(fallback[1])
    if (amount > 0) return amount
  }

  return null
}

function parseCOPAmount(raw: string): number {
  const s = raw.trim()
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')

  // Ambos separadores presentes: el último es decimal, el otro es miles
  // Ej: "45.000,00" → quitar ",00" → "45.000" → 45000
  // Ej: "45,000.00" → quitar ".00" → "45,000" → 45000
  if (hasDot && hasComma) {
    const withoutDecimal = s.replace(/[.,]\d{1,2}$/, '')
    return parseInt(withoutDecimal.replace(/[.,]/g, ''), 10)
  }

  // Un solo separador: si el último grupo tiene 1-2 dígitos es decimal
  // Ej: "45.00" → decimal → 45 | "45.000" → miles → 45000
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (lastSep !== -1 && s.length - lastSep - 1 <= 2) {
    return parseInt(s.slice(0, lastSep).replace(/[.,]/g, ''), 10)
  }

  return parseInt(s.replace(/[.,]/g, ''), 10)
}

// Letra inicial: A-Z + vocales con tilde + Ñ (mayúsculas y minúsculas cubiertas por \w)
const MERCHANT_FIRST_CHAR = '[A-ZÁÉÍÓÚÑa-záéíóúñ]'

function extractMerchant(body: string): string | null {
  const patterns = [
    // "compraste en Éxito" / "compra en McDonald's"
    new RegExp(`(?:compraste|compra)\\s+en\\s+(${MERCHANT_FIRST_CHAR}[\\w\\s\\-&.']+?)(?:\\s+con|\\s+por|\\s*[\\n\\r]|$)`, 'i'),
    // "realizaste una compra en Rappi Food"
    new RegExp(`realizaste.*?en\\s+(${MERCHANT_FIRST_CHAR}[\\w\\s\\-&.']+?)(?:\\s+con|\\s+por|\\s*[\\n\\r]|$)`, 'i'),
    // "establecimiento: Nombre"
    /establecimiento[:\s]+([\w\s\-&.'Á-Ú]+?)(?:\n|\r|$)/i,
    // "comercio: Nombre"
    /comercio[:\s]+([\w\s\-&.'Á-Ú]+?)(?:\n|\r|$)/i,
    // "en Nombre con RappiCard" — genérico
    new RegExp(`\\ben\\s+(${MERCHANT_FIRST_CHAR}[\\w\\s\\-&.']+?)(?:\\s+con|\\s+por|\\s*[\\n\\r]|\\.)`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = body.match(pattern)
    if (match) {
      const merchant = match[1].trim().replace(/\s+/g, ' ').slice(0, 80)
      if (merchant.length > 2) return merchant
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

  if (/uber|cabify|didi|indriver|taxi|transmilenio|sitp|metro|gasolina|gasolinera|q8|terpel|biomax|estacion de servicio/.test(c)) return 'TRANSPORTE'
  if (/rappi\s*food|ifood|domicilio|delivery|restaurante|cafe|café|bar|taberna|club|cine|evento|teatro|parque|heladeria|fruteria|panaderia|sushi|pizza|burger|domino|mcdonalds|mcdonald|kfc|subway/.test(c)) return 'SALIDAS'
  if (/farmacia|drogueria|droguería|medico|médico|clinic|hospital|eps|gym|gimnasio|veterinar|salud|audifarma|cruz verde|colsubsidio|cafam|compensar/.test(c)) return 'SALUD'
  if (/netflix|spotify|disney|hbo|prime video|apple tv|apple one|claude|adobe|microsoft|google one|youtube premium|deezer|crunchyroll/.test(c)) return 'SUSCRIPCIONES'
  if (/temu|amazon|mercadolibre|mercado libre|shein|falabella|alkosto|ktronix|linio|jumbo.*online/.test(c)) return 'COMPRAS_ONLINE'
  if (/claro|movistar|tigo|etb|epm|codensa|gas natural|gases|emcali|aire|acueducto|electricidad|internet|directv|telecomunicaciones/.test(c)) return 'HOGAR'
  if (/exito|éxito|carulla|jumbo|olimpica|olímpica|d1|ara|mercado|supertienda|supermercado|corabastos/.test(c)) return 'HOGAR'
  if (/cdt|fondo|inversión|inversion|boveda|bóveda|bolsa|crypto|bitcoin|eth|nu invest|renta fija/.test(c)) return 'INVERSION'
  if (/iglesia|fundacion|fundación|world vision|banco de alimentos/.test(c)) return 'DONACIONES'
  if (/universidad|colegio|curso|platzi|udemy|coursera|edx|duolingo|britanico|campuslands/.test(c)) return 'EDUCACION'
  if (/reembolso|reembolsable|anticipo|deducible/.test(c)) return 'REEMBOLSABLE'

  return 'OTRO'
}
