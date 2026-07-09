import type { EmailInput, ParseResult } from './types'
import { parseCOPAmount, toTitleCase, bogotaDateToUTC } from './utils'
import { guessCategoria } from './commerceCategories'

// Formato de email DAVIbank (Scotiabank Colombia):
//   Subject: "DAVIbank en Linea"
//   From:    DAVIbankInforma@davibank.com
//
// Cuerpo (tabla sin $ en el monto, fecha YYYY/MM/DD):
//   Comercio    BW BUFFALO WINGS ILARC
//   Monto       236,500
//   Fecha       2026/06/23
//   Hora        20:46:39

export function parseDavibank(email: EmailInput): ParseResult {
  const body = email.body

  // Solo procesa emails de transacción (tiene los 4 campos de la tabla)
  if (!/Comercio/i.test(body) || !/Monto/i.test(body)) return null

  // Monto — sin signo $, separador de miles con coma: "236,500"
  const montoMatch = body.match(/Monto\s+([\d,]+)/i)
  if (!montoMatch) return null
  const monto = parseCOPAmount(montoMatch[1])
  if (!monto || monto <= 0) return null

  // Comercio — todo en mayúsculas hasta el siguiente campo "Monto"
  const comercioMatch = body.match(/Comercio\s+([\w\s&./''`\-]+?)(?=\s+Monto|\n|$)/i)
  const comercio = comercioMatch
    ? toTitleCase(comercioMatch[1].trim())
    : null

  // Fecha YYYY/MM/DD + Hora HH:MM:SS → ISO
  const fechaMatch = body.match(/Fecha\s+(\d{4})\/(\d{2})\/(\d{2})/)
  const horaMatch  = body.match(/Hora\s+(\d{1,2}:\d{2})/)
  let fecha: string
  if (fechaMatch) {
    // Zero-pad single-digit hours: '9:09' → '09:09'
    const time = horaMatch ? horaMatch[1].padStart(5, '0') : '00:00'
    const [h, mi] = time.split(':').map(Number)
    fecha = bogotaDateToUTC(parseInt(fechaMatch[1]), parseInt(fechaMatch[2]) - 1, parseInt(fechaMatch[3]), h, mi)
  } else {
    fecha = new Date(email.date).toISOString()
  }

  return {
    fecha,
    monto,
    comercio,
    descripcion: comercio ? `Compra en ${comercio}` : 'Compra DAVIbank',
    banco: 'DAVIVIENDA',
    tipo: 'COMPRA',
    categoria: guessCategoria(comercio ?? ''),
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}
