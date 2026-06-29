/**
 * Parser universal para bancos colombianos sin parser específico.
 * Cubre Davivienda, BBVA, Nu, Nequi, Banco de Bogotá, Scotiabank Colpatria,
 * Lulo Bank, Itaú, Falabella y cualquier banco que notifique en español.
 * Se activa solo cuando trySpecificParser() retorna null (banco === 'OTRO').
 */
import type { EmailInput, ParseResult } from './types'
import { parseCOPAmount, toTitleCase, parseSpanishDate, parseISOLikeDate } from './utils'
import { guessCategoria } from './commerceCategories'

// ── Extracción de monto ──────────────────────────────────────────────────────

function extractAmount(text: string): number | null {
  // $1,234,567 / $1.234.567 / $1,234,567.89
  const dollarMatch = text.match(/\$\s*([\d.,]+)/)
  if (dollarMatch) {
    const v = parseCOPAmount(dollarMatch[1])
    if (v >= 1_000 && v < 500_000_000) return v
  }
  // "123,456 COP" / "COP 123,456" / "123,456 pesos"
  const copMatch = text.match(/(?:COP\s*)?([\d.,]+)\s*(?:COP|pesos?)\b/i)
  if (copMatch) {
    const v = parseCOPAmount(copMatch[1])
    if (v >= 1_000 && v < 500_000_000) return v
  }
  return null
}

// ── Extracción de fecha ──────────────────────────────────────────────────────

function extractDate(body: string, emailDate: string): string {
  // DD/MM/YYYY [a las] HH:MM
  const m1 = body.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+a las\s+|\s+)(\d{2}:\d{2})/i)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}T${m1[4]}:00`

  const m2 = body.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}T00:00:00`

  // DD-MM-YYYY
  const m3 = body.match(/(\d{2})-(\d{2})-(\d{4})/)
  if (m3) return `${m3[3]}-${m3[2]}-${m3[1]}T00:00:00`

  // ISO: 2026-06-07 [12:25]
  const iso = parseISOLikeDate(body)
  if (iso) return iso

  // "02 de mayo de 2026 [a las 15:30]"
  const spanishMatch = body.match(/\b(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})\b/i)
  if (spanishMatch) {
    const timeMatch = body.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)
    const parsed = parseSpanishDate(spanishMatch[1], timeMatch?.[1])
    if (parsed) return parsed
  }

  return new Date(emailDate || Date.now()).toISOString()
}

// ── Extracción de comercio ───────────────────────────────────────────────────

const STOP_WORDS_AFTER_MERCHANT = /\s+(?:con|por|el|desde|a las|hasta|para|en fecha|desde|tu|su|la|un|una)\b/i
const BLACKLIST_MERCHANT = /^\d+$|^(su|tu|la|el|un|una|este|esta)$/i

function extractMerchant(body: string): string | null {
  // "en COMERCIO con" / "en COMERCIO por" / "en COMERCIO el"
  const enMatch = body.match(/\ben\s+([A-ZÁÉÍÓÚÜÑ*\w][A-ZÁÉÍÓÚÜÑ*\w\s\-.'&]+?)(?=\s+con\b|\s+por\b|\s+el\b|\s+desde\b|\s+a las\b|[,.\n]|$)/i)
  if (enMatch) {
    const raw = enMatch[1].replace(STOP_WORDS_AFTER_MERCHANT, '').trim()
    if (raw.length >= 2 && raw.length <= 60 && !BLACKLIST_MERCHANT.test(raw) && !/\d{5,}/.test(raw)) {
      return toTitleCase(raw)
    }
  }

  // "a PERSONA" (transferencias)
  const aMatch = body.match(/\ba\s+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?=\s+(?:el|por|desde|con|en|la cuenta|al)\b|[,.\n]|$)/i)
  if (aMatch) {
    const raw = aMatch[1].trim()
    if (raw.length >= 3 && raw.length <= 60 && !BLACKLIST_MERCHANT.test(raw) && !/\d{4,}/.test(raw)) {
      return toTitleCase(raw)
    }
  }

  return null
}

// ── Detección de tipo ────────────────────────────────────────────────────────

const RE_ABONO      = /\b(abono a (tu |la )?(deuda|tarjeta|crédito)|pago a (su |tu )?(tarjeta|crédito|obligación))\b/i
const RE_RECIBIDA   = /\b(transferencia recibida|recibiste|te (enviaron|consignaron)|consignación recibida|ingreso recibido|depósito recibido|te abonaron)\b/i
const RE_ENVIADA    = /\b(transferencia enviada|transferiste|enviaste|envío a|enviado a|realizaste (una |la )?transferencia)\b/i
const RE_RETIRO     = /\b(retiro|retiraste|retiro en cajero|retiro (de )?cajero|ATM)\b/i
const RE_INGRESO    = /\b(consignación|ingreso (en|a) tu cuenta|depósito en cuenta|nómina|sueldo|salario|te abonamos)\b/i
const RE_PAGO_SVC   = /\b(pago (de |por )?(servicio|factura|recibo|PSE|código QR|QR)|pagaste por (código QR|PSE))\b/i
const RE_COMPRA     = /\b(compra|compró|compraste|consumo|cargo|transacción aprobada|pago con (tarjeta|tc|td)|compra aprobada|realizaste (un |una )?(compra|pago|consumo)|se (realizó|efectuó|aprobó) (una |la )?(compra|transacción))\b/i

// Emails que NO son transacciones (OTPs, alertas de inicio de sesión, promociones)
const RE_NOT_TX     = /\b(código|clave|contraseña|OTP|PIN|acceso|inicio de sesión|bienvenid|verifica|confirma|recuper(a|ación)|suscripción aprobad|descuento de hasta|obtén hasta|hasta \$\d|\d+% (de )?descuento)\b/i

// ── Parser principal ─────────────────────────────────────────────────────────

export function parseUniversal(email: EmailInput): ParseResult {
  const combined = `${email.subject}\n${email.body}`

  // Descartar emails que claramente no son transacciones
  if (RE_NOT_TX.test(combined) && !RE_COMPRA.test(combined) && !RE_ENVIADA.test(combined) && !RE_RECIBIDA.test(combined)) {
    return null
  }

  const monto = extractAmount(combined)
  if (!monto) return null

  const fecha   = extractDate(email.body, email.date)
  const comercio = extractMerchant(email.body)

  if (RE_ABONO.test(combined)) {
    return {
      fecha, monto, comercio, moneda: 'COP', monto_usd: null, flags: [],
      banco: 'OTRO', tipo: 'ABONO_DEUDA', categoria: 'DEUDA',
      subcategoria: null,
      descripcion: 'Abono a deuda',
    }
  }

  if (RE_RECIBIDA.test(combined)) {
    return {
      fecha, monto, comercio, moneda: 'COP', monto_usd: null, flags: [],
      banco: 'OTRO', tipo: 'TRANSFERENCIA_RECIBIDA', categoria: 'INGRESO',
      subcategoria: null,
      descripcion: comercio ? `Transferencia recibida de ${comercio}` : 'Transferencia recibida',
    }
  }

  if (RE_ENVIADA.test(combined)) {
    return {
      fecha, monto, comercio, moneda: 'COP', monto_usd: null, flags: [],
      banco: 'OTRO', tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'TRANSFERENCIA',
      subcategoria: null,
      descripcion: comercio ? `Transferencia a ${comercio}` : 'Transferencia enviada',
    }
  }

  if (RE_RETIRO.test(combined)) {
    return {
      fecha, monto, comercio: null, moneda: 'COP', monto_usd: null, flags: [],
      banco: 'OTRO', tipo: 'RETIRO', categoria: 'OTRO',
      subcategoria: null,
      descripcion: 'Retiro en cajero',
    }
  }

  if (RE_INGRESO.test(combined)) {
    return {
      fecha, monto, comercio, moneda: 'COP', monto_usd: null, flags: [],
      banco: 'OTRO', tipo: 'INGRESO', categoria: 'INGRESO',
      subcategoria: null,
      descripcion: comercio ? `Ingreso de ${comercio}` : 'Consignación recibida',
    }
  }

  if (RE_PAGO_SVC.test(combined)) {
    const cat = comercio ? guessCategoria(comercio) : 'OTRO'
    return {
      fecha, monto, comercio, moneda: 'COP', monto_usd: null, flags: [],
      banco: 'OTRO', tipo: 'PAGO_SERVICIO', categoria: cat,
      subcategoria: null,
      descripcion: comercio ? `Pago a ${comercio}` : 'Pago de servicio',
    }
  }

  if (RE_COMPRA.test(combined)) {
    const cat = comercio ? guessCategoria(comercio) : 'OTRO'
    return {
      fecha, monto, comercio, moneda: 'COP', monto_usd: null, flags: [],
      banco: 'OTRO', tipo: 'COMPRA', categoria: cat,
      subcategoria: null,
      descripcion: comercio ? `Compra en ${comercio}` : 'Compra con tarjeta',
    }
  }

  // Tiene monto pero ningún verbo de transacción claro → descartar
  return null
}
