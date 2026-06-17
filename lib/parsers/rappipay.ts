import type { EmailInput, ParseResult } from './types'
import { parseCOPAmount, parseSpanishDate, toTitleCase } from './utils'
import { guessCategoria } from './commerceCategories'

export function parseRappiPay(email: EmailInput): ParseResult {
  const body = email.body
  const subject = email.subject

  // Order matters: more specific patterns first

  // Rentabilidad mensual
  if (/rentabilidad|remuneraci[oó]n/i.test(subject + body)) {
    return parseRentabilidad(email)
  }

  // Pago de servicio (ENEL, utilities)
  if (/pago.*servicio|resumen.*pago.*servicio/i.test(subject + body)) {
    return parsePagoServicio(email)
  }

  // Compra con PSE — "Resumen compra con Pse"
  if (/compra.*pse|pse/i.test(subject) || /Tipo de transacci[oó]n\s+PSE/i.test(body)) {
    return parsePSECompra(email)
  }

  // Depósito bancario (salary, employer transfers) — detected by subject
  if (/resumen transferencia bancaria|transferencia bancaria/i.test(subject + body)) {
    return parseIngresoBancario(email)
  }

  // Transferencia recibida (llave) — "Monto recibido" + "tu RappiCuenta"
  if (/monto recibido/i.test(body) && /rappiCuenta|tus llaves|ya est[aá] disponible/i.test(body)) {
    return parseTransferenciaRecibida(email)
  }

  // Transferencia enviada (llave)
  if (/monto transferido|transferencia fue enviada|dinero est[aá] en camino/i.test(body)) {
    return parseTransferenciaEnviada(email)
  }

  return null
}

function extractFechaHora(body: string, emailDate: string): string {
  const fechaMatch = body.match(/Fecha de la transacci[oó]n\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)
  const horaMatch = body.match(/Hora de la transacci[oó]n\s+(\d{1,2}:\d{2}\s*[ap]m)/i)

  if (fechaMatch) {
    return parseSpanishDate(fechaMatch[1], horaMatch?.[1]) ?? new Date(emailDate).toISOString()
  }
  return new Date(emailDate).toISOString()
}

function parseTransferenciaRecibida(email: EmailInput): ParseResult {
  const body = email.body

  const montoMatch = body.match(/Monto recibido\s+\$([\d.,]+)/i)
  if (!montoMatch) return null

  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  // Banco origen: "Banco\nBancolombia\nNro." → stops before next field
  const bancoMatch = body.match(/\bBanco\s+([^\n$]{1,80}?)(?=\s+(?:Nro|No\.|Fecha|¿|$))/i)
  const origen = bancoMatch ? toTitleCase(bancoMatch[1].trim()) : null

  return {
    fecha: extractFechaHora(body, email.date),
    monto,
    comercio: origen,
    descripcion: origen ? `Transferencia recibida de ${origen}` : 'Transferencia recibida',
    banco: 'RAPPIPAY',
    tipo: 'TRANSFERENCIA_RECIBIDA',
    categoria: 'INGRESO',
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function parseTransferenciaEnviada(email: EmailInput): ParseResult {
  const body = email.body

  const montoMatch = body.match(/Monto transferido\s+\$([\d.,]+)/i)
  if (!montoMatch) return null

  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  // Destinatario: llave tipo @handle
  const llaveMatch = body.match(/Llave destino\s+(@?\S+)/i)
  const destinatario = llaveMatch ? llaveMatch[1].trim() : null

  return {
    fecha: extractFechaHora(body, email.date),
    monto,
    comercio: destinatario,
    descripcion: destinatario ? `Transferencia enviada a ${destinatario}` : 'Transferencia enviada',
    banco: 'RAPPIPAY',
    tipo: 'TRANSFERENCIA_ENVIADA',
    categoria: 'TRANSFERENCIA',
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function parseIngresoBancario(email: EmailInput): ParseResult {
  const body = email.body

  const montoMatch = body.match(/Monto recibido\s+\$([\d.,]+)/i)
  if (!montoMatch) return null

  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  // "Banco\nBANCO CITIBANK COLOMBIA\nNo. de transacción"
  const bancoMatch = body.match(/\bBanco\s+([^\n$]{1,80}?)(?=\s+(?:No\.|Nro|Fecha|¿|$))/i)
  const origen = bancoMatch ? toTitleCase(bancoMatch[1].trim()) : null

  return {
    fecha: extractFechaHora(body, email.date),
    monto,
    comercio: origen,
    descripcion: origen ? `Depósito de ${origen}` : 'Ingreso bancario',
    banco: 'RAPPIPAY',
    tipo: 'INGRESO',
    categoria: 'INGRESO',
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function parsePagoServicio(email: EmailInput): ParseResult {
  const body = email.body

  // Preferir "Pago total" sobre "Monto de recibo" (ambos deberían ser iguales)
  const montoMatch = body.match(/(?:Pago total|Monto de recibo)\s+\$([\d.,]+)/i)
  if (!montoMatch) return null

  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  // "Convenio\nENEL\nReferencia"
  const convenioMatch = body.match(/\bConvenio\s+([^\n$]{1,60}?)(?=\s+(?:Referencia|M[eé]todo|Monto|$))/i)
  const comercio = convenioMatch ? toTitleCase(convenioMatch[1].trim()) : null

  // Formato especial: "Fecha y hora\n19:36 hrs, 27 Abr. 2026"
  const fechaHoraMatch = body.match(/Fecha y hora\s+(\d{2}:\d{2})\s*hrs?,?\s+(\d{1,2}\s+\w+\.?\s+\d{4})/i)
  let fecha: string | null = null
  if (fechaHoraMatch) {
    // group 1 = "19:36" (time), group 2 = "27 Abr. 2026" (date)
    fecha = parseSpanishDate(fechaHoraMatch[2], fechaHoraMatch[1])
  }

  return {
    fecha: fecha ?? new Date(email.date).toISOString(),
    monto,
    comercio,
    descripcion: comercio ? `Pago de servicio ${comercio}` : 'Pago de servicio',
    banco: 'RAPPIPAY',
    tipo: 'PAGO_SERVICIO',
    categoria: 'HOGAR',
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function parsePSECompra(email: EmailInput): ParseResult {
  const body = email.body

  const montoMatch = body.match(/Monto\s+\$([\d.,]+)/i)
  if (!montoMatch) return null

  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  const comercioMatch = body.match(/Comercio\s+([^\n]{1,120})/i)
  const comercio = comercioMatch ? toTitleCase(comercioMatch[1].trim()) : null

  return {
    fecha: extractFechaHora(body, email.date),
    monto,
    comercio,
    descripcion: comercio ? `Pago PSE a ${comercio}` : 'Pago PSE',
    banco: 'RAPPIPAY',
    tipo: 'COMPRA',
    categoria: guessCategoria(comercio ?? ''),
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

function parseRentabilidad(email: EmailInput): ParseResult {
  const body = email.body

  // "Rentabilidad de Abril\n$203.770,46"
  const montoMatch = body.match(/Rentabilidad de \w+\s+\$([\d.,]+)/i)
  if (!montoMatch) return null

  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  // "Fecha de corte\n30 de abril de 2026"
  const fechaMatch = body.match(/Fecha de corte\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)
  const fecha = fechaMatch
    ? parseSpanishDate(fechaMatch[1])
    : new Date(email.date).toISOString()

  return {
    fecha: fecha ?? new Date(email.date).toISOString(),
    monto,
    comercio: 'RappiCuenta',
    descripcion: 'Rendimiento mensual RappiCuenta',
    banco: 'RAPPIPAY',
    tipo: 'INGRESO',
    categoria: 'INGRESO',
    subcategoria: 'rendimiento',
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}
