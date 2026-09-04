// Parser genérico: cubre los campos que casi todos los bancos reportan
// (monto, tipo, fecha, comercio) usando patrones de texto — en español
// (bancos colombianos) o en inglés (cualquier otro banco que reenvíe un
// usuario). Se intenta después de un parser específico (si existe) y antes
// del fallback de IA — el objetivo es evitar gastar cuota de Groq en el
// caso común, sin importar el idioma del correo.
//
// Solo devuelve resultado si logra tipo Y monto con certeza razonable; si
// falta cualquiera de los dos, devuelve null y deja que el pipeline caiga al
// fallback de IA en vez de insertar un dato adivinado.
import type { Banco, Categoria, TipoTransaccion } from '@/lib/types'
import type { EmailInput, ParseResult } from './types'
import {
  parseCOPAmount, parseUSAmount,
  parseSpanishDate, parseEnglishDate, parseISOLikeDate,
  toTitleCase,
} from './utils'
import { guessCategoria } from './commerceCategories'

type Idioma = 'es' | 'en'

const TIPO_PATTERNS_ES: Array<{ tipo: TipoTransaccion; re: RegExp }> = [
  // Antes que COMPRA: "pago de tu tarjeta" no debe leerse como una compra.
  { tipo: 'ABONO_DEUDA', re: /pago de tu tarjeta|comprobante de pago|recibimos el pago|pago recibido a tu tarjeta/i },
  { tipo: 'RETIRO', re: /retiro en cajero|retiraste\b|retiro por\b/i },
  { tipo: 'PAGO_SERVICIO', re: /pago de servicio|pago de (?:tu|la) factura|pago tu factura/i },
  { tipo: 'TRANSFERENCIA_RECIBIDA', re: /recibiste una transferencia|te transfirieron|consignaron en tu cuenta|monto recibido/i },
  { tipo: 'TRANSFERENCIA_ENVIADA', re: /transferiste\b|enviaste una transferencia|realizaste una transferencia/i },
  { tipo: 'INGRESO', re: /rentabilidad|remuneraci[oó]n|abono por n[oó]mina|consignaci[oó]n recibida/i },
  { tipo: 'COMPRA', re: /compraste\b|realizaste una compra|compra (?:aprobada|exitosa|por)/i },
]

const TIPO_PATTERNS_EN: Array<{ tipo: TipoTransaccion; re: RegExp }> = [
  // Antes que COMPRA: un pago recibido en tu tarjeta no es una compra.
  { tipo: 'ABONO_DEUDA', re: /payment (?:was )?(?:received|posted|applied) to your (?:card|account)|we received your payment|your (?:card )?payment (?:was )?posted/i },
  { tipo: 'RETIRO', re: /\bwithdrawal\b|you withdrew|cash withdrawal/i },
  { tipo: 'PAGO_SERVICIO', re: /bill payment|you paid your bill|utility payment/i },
  { tipo: 'TRANSFERENCIA_RECIBIDA', re: /you received a transfer|transfer (?:was )?received|incoming transfer|deposit received/i },
  { tipo: 'TRANSFERENCIA_ENVIADA', re: /you sent a transfer|transfer (?:was )?sent|you transferred|outgoing transfer/i },
  { tipo: 'INGRESO', re: /direct deposit/i },
  { tipo: 'COMPRA', re: /you made a purchase|purchase (?:was )?made|debit card purchase|card purchase|a charge (?:was made|of)|you spent/i },
]

function detectTipo(text: string, patterns: typeof TIPO_PATTERNS_ES): TipoTransaccion | null {
  for (const { tipo, re } of patterns) {
    if (re.test(text)) return tipo
  }
  return null
}

// Captura el monto crudo (dígitos + separadores) cerca de una palabra clave
// conocida en cualquiera de los dos idiomas, o el primer "$" del correo — la
// interpretación de esos dígitos (COP vs. US) depende del idioma detectado
// por `detectTipo`, no de este regex.
const AMOUNT_NEAR_KEYWORD = /(?:valor|monto|amount)\s*(?:de|of)?\s*:?\s*\$\s*([\d.,]+)/i
const AMOUNT_ANY = /\$\s*([\d.,]+)/

function extractMonto(text: string, idioma: Idioma): number | null {
  const match = AMOUNT_NEAR_KEYWORD.exec(text) ?? AMOUNT_ANY.exec(text)
  if (!match) return null
  const monto = idioma === 'en' ? parseUSAmount(match[1]) : parseCOPAmount(match[1])
  return Number.isFinite(monto) && monto > 0 ? monto : null
}

function extractFecha(text: string, emailDate: string, idioma: Idioma): string | null {
  if (idioma === 'es') {
    const spanishMatch = text.match(/(\d{1,2}\s+(?:de\s+)?\w+\.?\s+(?:de\s+)?\d{4})/i)
    if (spanishMatch) {
      const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)
      const parsed = parseSpanishDate(spanishMatch[1], timeMatch?.[1])
      if (parsed) return parsed
    }
  } else {
    const englishMatch = text.match(/(\w+\.?\s+\d{1,2},?\s+\d{4})/)
    if (englishMatch) {
      const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)
      const parsed = parseEnglishDate(englishMatch[1], timeMatch?.[1])
      if (parsed) return parsed
    }
  }

  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/)
  if (isoMatch) {
    const parsed = parseISOLikeDate(isoMatch[0])
    if (parsed) return parsed
  }

  const headerDate = new Date(emailDate)
  return isNaN(headerDate.getTime()) ? null : headerDate.toISOString()
}

function extractComercio(text: string, idioma: Idioma): string | null {
  const labelRe = idioma === 'en'
    ? /(?:merchant|payee|recipient)\s*:?\s*\n?\s*([^\n]{2,60})/i
    : /(?:comercio|establecimiento|beneficiario)\s*:?\s*\n?\s*([^\n]{2,60})/i
  const label = text.match(labelRe)
  if (label) return toTitleCase(label[1].trim())

  const sentenceRe = idioma === 'en'
    ? /\bat\s+([A-Z0-9][\w.&'\- #]{1,40}?)(?:[.,;\n]|\s+(?:on|for)\b)/
    : /\ben\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.&'\- ]{1,40}?)(?:[.,;\n]|\s+(?:el|por|con)\b)/
  const sentence = text.match(sentenceRe)
  if (sentence) return toTitleCase(sentence[1].trim())

  return null
}

function build(
  idioma: Idioma, tipo: TipoTransaccion, monto: number,
  comercio: string | null, fecha: string | null, banco: Banco
): ParseResult {
  const categoria: Categoria = comercio ? guessCategoria(comercio) : 'OTRO'
  const moneda = idioma === 'en' ? 'USD' : 'COP'
  return {
    fecha, monto, comercio,
    descripcion: null,
    banco, tipo, categoria,
    subcategoria: null,
    moneda,
    monto_usd: idioma === 'en' ? monto : null,
    flags: ['parser_generico'],
  }
}

export function tryGenericParser(email: EmailInput, banco: Banco): ParseResult {
  const text = `${email.subject}\n${email.body}`

  const tipoEs = detectTipo(text, TIPO_PATTERNS_ES)
  if (tipoEs) {
    const monto = extractMonto(text, 'es')
    if (monto != null) {
      const comercio = extractComercio(text, 'es')
      return build('es', tipoEs, monto, comercio, extractFecha(text, email.date, 'es'), banco)
    }
  }

  const tipoEn = detectTipo(text, TIPO_PATTERNS_EN)
  if (tipoEn) {
    const monto = extractMonto(text, 'en')
    if (monto != null) {
      const comercio = extractComercio(text, 'en')
      return build('en', tipoEn, monto, comercio, extractFecha(text, email.date, 'en'), banco)
    }
  }

  return null
}
