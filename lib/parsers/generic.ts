// Parser genérico: cubre los campos que casi todos los bancos colombianos
// reportan (monto, tipo, fecha, comercio) usando el mismo vocabulario en
// español que ya funciona en los parsers específicos, sin depender de la
// estructura exacta de un banco en particular. Se intenta después de un
// parser específico (si existe) y antes del fallback de IA — el objetivo es
// evitar gastar cuota de Groq en bancos que no tienen parser dedicado pero
// cuyo correo sigue el mismo patrón narrativo de siempre.
//
// Solo devuelve resultado si logra tipo Y monto con certeza razonable; si
// falta cualquiera de los dos, devuelve null y deja que el pipeline caiga al
// fallback de IA en vez de insertar un dato adivinado.
import type { Banco, TipoTransaccion } from '@/lib/types'
import type { EmailInput, ParseResult } from './types'
import { parseCOPAmount, parseSpanishDate, parseISOLikeDate, toTitleCase } from './utils'
import { guessCategoria } from './commerceCategories'

const TIPO_PATTERNS: Array<{ tipo: TipoTransaccion; re: RegExp }> = [
  // Antes que COMPRA: "pago de tu tarjeta" no debe leerse como una compra.
  { tipo: 'ABONO_DEUDA', re: /pago de tu tarjeta|comprobante de pago|recibimos el pago|pago recibido a tu tarjeta/i },
  { tipo: 'RETIRO', re: /retiro en cajero|retiraste\b|retiro por\b/i },
  { tipo: 'PAGO_SERVICIO', re: /pago de servicio|pago de (?:tu|la) factura|pago tu factura/i },
  { tipo: 'TRANSFERENCIA_RECIBIDA', re: /recibiste una transferencia|te transfirieron|consignaron en tu cuenta|monto recibido/i },
  { tipo: 'TRANSFERENCIA_ENVIADA', re: /transferiste\b|enviaste una transferencia|realizaste una transferencia/i },
  { tipo: 'INGRESO', re: /rentabilidad|remuneraci[oó]n|abono por n[oó]mina|consignaci[oó]n recibida/i },
  { tipo: 'COMPRA', re: /compraste\b|realizaste una compra|compra (?:aprobada|exitosa|por)/i },
]

function detectTipo(text: string): TipoTransaccion | null {
  for (const { tipo, re } of TIPO_PATTERNS) {
    if (re.test(text)) return tipo
  }
  return null
}

const AMOUNT_NEAR_KEYWORD = /(?:valor|monto)\s*(?:de)?\s*:?\s*\$\s*([\d.,]+)/i
const AMOUNT_ANY = /\$\s*([\d.,]+)/

function extractMonto(text: string): number | null {
  const match = AMOUNT_NEAR_KEYWORD.exec(text) ?? AMOUNT_ANY.exec(text)
  if (!match) return null
  const monto = parseCOPAmount(match[1])
  return Number.isFinite(monto) && monto > 0 ? monto : null
}

function extractFecha(text: string, emailDate: string): string | null {
  const spanishMatch = text.match(/(\d{1,2}\s+(?:de\s+)?\w+\.?\s+(?:de\s+)?\d{4})/i)
  if (spanishMatch) {
    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)
    const parsed = parseSpanishDate(spanishMatch[1], timeMatch?.[1])
    if (parsed) return parsed
  }

  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/)
  if (isoMatch) {
    const parsed = parseISOLikeDate(isoMatch[0])
    if (parsed) return parsed
  }

  const headerDate = new Date(emailDate)
  return isNaN(headerDate.getTime()) ? null : headerDate.toISOString()
}

function extractComercio(text: string): string | null {
  const label = text.match(/(?:comercio|establecimiento|beneficiario)\s*:?\s*\n?\s*([^\n]{2,60})/i)
  if (label) return toTitleCase(label[1].trim())

  const sentence = text.match(/\ben\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.&'\- ]{1,40}?)(?:[.,;\n]|\s+(?:el|por|con)\b)/)
  if (sentence) return toTitleCase(sentence[1].trim())

  return null
}

export function tryGenericParser(email: EmailInput, banco: Banco): ParseResult {
  const text = `${email.subject}\n${email.body}`

  const tipo = detectTipo(text)
  const monto = extractMonto(text)
  if (!tipo || monto == null) return null

  const comercio = extractComercio(text)

  return {
    fecha: extractFecha(text, email.date),
    monto,
    comercio,
    descripcion: null,
    banco,
    tipo,
    categoria: comercio ? guessCategoria(comercio) : 'OTRO',
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: ['parser_generico'],
  }
}
