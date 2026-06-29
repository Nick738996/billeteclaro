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
  // $1,234,567 / $1.234.567 / $ 50.000 (con o sin espacio)
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
  // "valor: 50.000" / "por valor de 50.000"
  const valorMatch = text.match(/(?:valor\s*(?:de\s*)?:?\s*)([\d.,]+)/i)
  if (valorMatch) {
    const v = parseCOPAmount(valorMatch[1])
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

  // "02 de mayo de 2026 [a las 15:30]" / "28 jun 2026"
  const spanishMatch = body.match(/\b(\d{1,2}\s+(?:de\s+)?\w+\.?\s+(?:de\s+)?\d{4})\b/i)
  if (spanishMatch) {
    const timeMatch = body.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)
    const parsed = parseSpanishDate(spanishMatch[1], timeMatch?.[1])
    if (parsed) return parsed
  }

  return new Date(emailDate || Date.now()).toISOString()
}

// ── Extracción de comercio ───────────────────────────────────────────────────

// Palabras que no pueden ser un comercio (artículos, posesivos, preposiciones)
const STOP_WORDS_AFTER_MERCHANT = /\s+(?:con|por|el|la|los|las|desde|a las|hasta|para|en fecha|tu|su|mi|un|una)\b/i
const BLACKLIST_MERCHANT        = /^\d+$|^(su|tu|mi|la|el|los|las|un|una|este|esta|cuenta|tarjeta|cajero)\b/i

function extractMerchant(body: string): string | null {
  // "en COMERCIO" — excluye "en su/tu/mi/la/el/un/una" y "en 1234" (números de cuenta)
  const enMatch = body.match(/\ben\s+(?!su\b|tu\b|mi\b|la\b|el\b|los\b|las\b|un\b|una\b|\d)([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\w\s\-.'&*]+?)(?=\s+con\b|\s+por\b|\s+el\b|\s+la\b|\s+desde\b|\s+a las\b|\s+terminada\b|\s+el\s+\d|[,.\n]|$)/i)
  if (enMatch) {
    const raw = enMatch[1].replace(STOP_WORDS_AFTER_MERCHANT, '').trim()
    // Limitar a 5 palabras máximo (nombres de comercio reales no son más largos)
    const words = raw.split(/\s+/).slice(0, 5).join(' ')
    if (words.length >= 2 && words.length <= 60 && !BLACKLIST_MERCHANT.test(words) && !/\d{5,}/.test(words)) {
      return toTitleCase(words)
    }
  }

  // "a PERSONA" (transferencias enviadas: Nequi "Enviaste $X a Maria Garcia")
  const aMatch = body.match(/\ba\s+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?=\s+(?:el|por|desde|con|en|la cuenta|al|las)\b|[,.\n]|$)/i)
  if (aMatch) {
    const raw = aMatch[1].trim().split(/\s+/).slice(0, 4).join(' ')
    if (raw.length >= 3 && raw.length <= 50 && !BLACKLIST_MERCHANT.test(raw) && !/\d{4,}/.test(raw)) {
      return toTitleCase(raw)
    }
  }

  // "de PERSONA" (transferencias recibidas: Nequi "Recibiste $X de Carlos Perez")
  const deMatch = body.match(/\bde\s+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?=\s+(?:el|por|desde|con|en|la|al)\b|[,.\n]|$)/i)
  if (deMatch) {
    const raw = deMatch[1].trim().split(/\s+/).slice(0, 4).join(' ')
    if (raw.length >= 3 && raw.length <= 50 && !BLACKLIST_MERCHANT.test(raw) && !/\d{4,}/.test(raw)) {
      return toTitleCase(raw)
    }
  }

  return null
}

// ── Detección de tipo ────────────────────────────────────────────────────────

const RE_ABONO    = /\b(abono a (tu |la )?(deuda|tarjeta|crédito)|pago a (su |tu )?(tarjeta|crédito|obligación))\b/i

// Transferencia recibida: bancos clásicos + Nequi "Recibiste $X"
const RE_RECIBIDA = /\b(transferencia recibida|recibiste|te (enviaron|consignaron)|consignación recibida|ingreso recibido|depósito recibido|te abonaron|abono recibido)\b/i

// Transferencia enviada: bancos clásicos + Nequi "Enviaste $X a" + "Pagaste $X a"
const RE_ENVIADA  = /\b(transferencia enviada|transferiste|enviaste|envío a|enviado\b|realizaste (una |la )?transferencia|pagaste\s+\$[\d.,]+\s+a\s)/i

const RE_RETIRO   = /\b(retiro|retiraste|retiro en cajero|retiro (de )?cajero|ATM|avance en efectivo)\b/i

const RE_INGRESO  = /\b(consignación|ingreso (en|a) tu cuenta|depósito en cuenta|nómina|sueldo|salario|te abonamos|pago de nómina)\b/i

// Pago de servicio: débito automático, PSE, QR
const RE_PAGO_SVC = /\b(pago (de |por )?(servicio|factura|recibo|PSE|código QR|QR)|pagaste por (código QR|PSE)|débito automático|pago automático|pago programado)\b/i

// Compra genérica: cubre Davivienda "débito", Nu "Usaste", BBVA "has realizado una compra", Nequi "Pagaste en"
const RE_COMPRA   = /\b(compra|compró|compraste|consumo|cargo|débito|debitado|usaste|utilizaste|ha sido usada?|pagaste|transacción aprobada|transacción realizada|operación realizada|movimiento realizado|pago con (tarjeta|tc|td)|compra aprobada|realizaste (un |una )?(compra|pago|consumo)|se (realizó|efectuó|aprobó) (una? |la )?(compra|transacción|débito|cargo|operación))\b/i

// Emails promocionales — siempre descartados, sin excepción
const RE_PROMO    = /\b(obtén hasta|descuento de hasta|\d+% (de )?descuento|código de descuento|cashback de|oferta especial|hasta \d+ ?% (?:de )?desc)\b/i

// Emails de seguridad/sistema — descartados si no hay verbo de transacción
const RE_NOT_TX   = /\b(código|clave|contraseña|OTP|PIN|acceso|inicio de sesión|bienvenid|verifica|confirma|recuper(a|ación)|suscripción aprobad)\b/i

// ── Parser principal ─────────────────────────────────────────────────────────

export function parseUniversal(email: EmailInput): ParseResult {
  const combined = `${email.subject}\n${email.body}`

  // Descartar emails promocionales sin excepción
  if (RE_PROMO.test(combined)) return null

  // Descartar emails de seguridad/sistema si no hay verbo de transacción
  if (RE_NOT_TX.test(combined) && !RE_COMPRA.test(combined) && !RE_ENVIADA.test(combined) && !RE_RECIBIDA.test(combined)) {
    return null
  }

  const monto = extractAmount(combined)
  if (!monto) return null

  const fecha    = extractDate(email.body, email.date)
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
