import type { EmailInput, ParseResult } from './types'
import type { TipoTransaccion } from '@/lib/types'

// Parses Bancolombia transaction notification emails
export function parseBancolombia(email: EmailInput): ParseResult {
  const body = email.body

  const monto = extractAmount(body)
  if (!monto) return null

  const tipo = detectTipo(body)
  const comercio = extractMerchant(body, tipo)
  const fecha = extractDate(body, email.date)

  return {
    fecha,
    monto,
    comercio,
    descripcion: buildDescripcion(tipo, comercio, body),
    banco: 'BANCOLOMBIA',
    tipo,
    categoria: classifyBancolombia(tipo, comercio ?? ''),
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function extractAmount(body: string): number | null {
  const patterns = [
    /\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{2})?)/,
    /por\s+valor\s+de\s+\$?\s*([\d]{1,3}(?:[.,][\d]{3})*)/i,
    /valor[:\s]+\$?\s*([\d]{1,3}(?:[.,][\d]{3})*)/i,
    /COP\s*([\d,\.]+)/i,
  ]

  for (const pattern of patterns) {
    const match = body.match(pattern)
    if (match) {
      const raw = match[1].replace(/\./g, '').replace(/,/g, '')
      const num = parseFloat(raw)
      if (!isNaN(num) && num > 0) return num
    }
  }

  return null
}

function detectTipo(body: string): TipoTransaccion {
  const text = body.toLowerCase()

  if (/(transferencia|transfer).*envi/.test(text)) return 'TRANSFERENCIA_ENVIADA'
  if (/(transferencia|transfer).*recib/.test(text)) return 'TRANSFERENCIA_RECIBIDA'
  if (/recibiste.*transferencia/.test(text)) return 'TRANSFERENCIA_RECIBIDA'
  if (/enviaste.*transferencia/.test(text)) return 'TRANSFERENCIA_ENVIADA'
  if (/retiro/.test(text)) return 'RETIRO'
  if (/(pago.*servicio|servicio.*pago|factura)/.test(text)) return 'PAGO_SERVICIO'
  if (/(abono|pago.*tarjeta)/.test(text)) return 'ABONO_DEUDA'
  if (/(nómina|nomina|ingreso|consignación|consignacion)/.test(text)) return 'INGRESO'
  return 'COMPRA'
}

function extractMerchant(body: string, tipo: TipoTransaccion): string | null {
  const patterns: RegExp[] = []

  if (tipo === 'TRANSFERENCIA_ENVIADA' || tipo === 'TRANSFERENCIA_RECIBIDA') {
    patterns.push(
      /a[:\s]+([A-Za-zÀ-ÿ\s]+?)(?:\s+por|\s+\$|\n|\r)/i,
      /de[:\s]+([A-Za-zÀ-ÿ\s]+?)(?:\s+por|\s+\$|\n|\r)/i,
      /beneficiario[:\s]+([A-Za-zÀ-ÿ\s]+?)(?:\n|\r|$)/i,
    )
  } else {
    patterns.push(
      /en[:\s]+([A-Za-z0-9\s\-&.À-ÿ]+?)(?:\s+por|\s+\$|\n|\r)/i,
      /establecimiento[:\s]+([A-Za-z0-9\s\-&.À-ÿ]+?)(?:\n|\r|$)/i,
      /comercio[:\s]+([A-Za-z0-9\s\-&.À-ÿ]+?)(?:\n|\r|$)/i,
    )
  }

  for (const pattern of patterns) {
    const match = body.match(pattern)
    if (match) {
      return match[1].trim().slice(0, 100)
    }
  }

  return null
}

function extractDate(body: string, fallback: string): string {
  const patterns = [
    /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/,
    /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/,
    /(\d{2}-\d{2}-\d{4})/,
  ]

  for (const p of patterns) {
    const m = body.match(p)
    if (m) {
      try {
        const d = new Date(m[0])
        if (!isNaN(d.getTime())) return d.toISOString()
      } catch { /* ignore */ }
    }
  }

  try {
    return new Date(fallback).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function buildDescripcion(
  tipo: TipoTransaccion,
  comercio: string | null,
  body: string
): string {
  if (comercio) return `${comercio} — Bancolombia`

  const tipoLabel: Record<TipoTransaccion, string> = {
    COMPRA: 'Compra',
    TRANSFERENCIA_ENVIADA: 'Transferencia enviada',
    TRANSFERENCIA_RECIBIDA: 'Transferencia recibida',
    PAGO_SERVICIO: 'Pago de servicio',
    RETIRO: 'Retiro',
    ABONO_DEUDA: 'Abono a deuda',
    INGRESO: 'Ingreso',
  }

  return `${tipoLabel[tipo]} — Bancolombia`
}

function classifyBancolombia(tipo: TipoTransaccion, comercio: string) {
  if (tipo === 'INGRESO') return 'INGRESO' as const
  if (tipo === 'TRANSFERENCIA_ENVIADA' || tipo === 'TRANSFERENCIA_RECIBIDA') return 'TRANSFERENCIA' as const
  if (tipo === 'RETIRO') return 'OTRO' as const
  if (tipo === 'ABONO_DEUDA') return 'OTRO' as const

  const c = comercio.toLowerCase()
  if (/claro|movistar|tigo|epm|codensa|gas/.test(c)) return 'HOGAR' as const
  if (/uber|cabify|didi/.test(c)) return 'TRANSPORTE' as const
  if (/rappi|restaurante|cafe/.test(c)) return 'SALIDAS' as const
  if (/farmacia|drogueria/.test(c)) return 'SALUD' as const

  return 'OTRO' as const
}
