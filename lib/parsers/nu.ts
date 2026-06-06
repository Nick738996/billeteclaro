import type { EmailInput, ParseResult } from './types'
import type { TipoTransaccion } from '@/lib/types'

// Parses Nu Colombia transaction notification emails
export function parseNu(email: EmailInput): ParseResult {
  const body = email.body
  const subject = email.subject.toLowerCase()

  const monto = extractAmount(body)
  if (!monto) return null

  const tipo = detectTipo(subject, body)
  const comercio = extractMerchant(body, tipo)
  const fecha = extractDate(email.date)

  return {
    fecha,
    monto,
    comercio,
    descripcion: comercio ? `${comercio} — Nu` : 'Transacción Nu',
    banco: 'NU',
    tipo,
    categoria: classifyNu(tipo, comercio ?? ''),
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function extractAmount(body: string): number | null {
  const patterns = [
    /\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{2})?)/,
    /COP\s*([\d,\.]+)/i,
    /(\d{1,3}(?:[.,]\d{3})+)\s*(?:pesos|COP)/i,
  ]

  for (const p of patterns) {
    const m = body.match(p)
    if (m) {
      const cleaned = m[1].replace(/\./g, '').replace(/,/g, '')
      const num = parseFloat(cleaned)
      if (!isNaN(num) && num > 0) return num
    }
  }

  return null
}

function detectTipo(subject: string, body: string): TipoTransaccion {
  const text = (subject + ' ' + body).toLowerCase()
  if (/transferiste|enviaste|transfer.*envi/.test(text)) return 'TRANSFERENCIA_ENVIADA'
  if (/recibiste|te.*transferi/.test(text)) return 'TRANSFERENCIA_RECIBIDA'
  if (/retiro/.test(text)) return 'RETIRO'
  if (/pago.*servicio|factura/.test(text)) return 'PAGO_SERVICIO'
  if (/ingreso|nómina/.test(text)) return 'INGRESO'
  return 'COMPRA'
}

function extractMerchant(body: string, tipo: TipoTransaccion): string | null {
  if (tipo === 'TRANSFERENCIA_ENVIADA' || tipo === 'TRANSFERENCIA_RECIBIDA') {
    const m = body.match(/(?:a|de)\s+([A-Za-zÀ-ÿ\s]{3,50}?)(?:\s+por|\s+\$|\n|$)/i)
    if (m) return m[1].trim()
  }

  const patterns = [
    /en\s+([A-Za-z0-9\s\-&.À-ÿ]{3,60}?)(?:\s+por|\s+\$|\n|$)/i,
    /compraste\s+(?:en\s+)?([A-Za-z0-9\s\-&.À-ÿ]{3,60}?)(?:\s+por|\s+\$|\n|$)/i,
  ]

  for (const p of patterns) {
    const m = body.match(p)
    if (m) return m[1].trim().slice(0, 100)
  }

  return null
}

function extractDate(dateHeader: string): string {
  try {
    return new Date(dateHeader).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function classifyNu(tipo: TipoTransaccion, comercio: string) {
  if (tipo === 'INGRESO') return 'INGRESO' as const
  if (tipo === 'TRANSFERENCIA_ENVIADA' || tipo === 'TRANSFERENCIA_RECIBIDA') return 'TRANSFERENCIA' as const

  const c = comercio.toLowerCase()
  if (/uber|cabify|didi/.test(c)) return 'TRANSPORTE' as const
  if (/rappi|restaurant|cafe/.test(c)) return 'SALIDAS' as const
  if (/farmacia|drogueria/.test(c)) return 'SALUD' as const
  if (/netflix|spotify|disney/.test(c)) return 'SUSCRIPCIONES' as const
  if (/temu|amazon|mercado/.test(c)) return 'COMPRAS_ONLINE' as const

  return 'OTRO' as const
}
