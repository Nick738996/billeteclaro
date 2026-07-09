// Los bancos reportan la hora en el reloj de Bogotá sin indicar zona horaria.
// Colombia no tiene horario de verano — siempre UTC-5. Hay que fijar ese offset
// explícitamente en vez de depender de la zona horaria del proceso que corre el
// parser (naive `new Date(...)` da resultados distintos en local vs. Vercel/UTC).
export function bogotaDateToUTC(
  year: number, month0: number, day: number,
  hour = 0, minute = 0, second = 0
): string {
  return new Date(Date.UTC(year, month0, day, hour + 5, minute, second)).toISOString()
}

const MESES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, mar: 2, abr: 3, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
}

export function parseCOPAmount(raw: string): number {
  const s = raw.trim().replace(/\s/g, '')
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')

  if (hasDot && hasComma) {
    const withoutDecimal = s.replace(/[.,]\d{1,2}$/, '')
    return parseInt(withoutDecimal.replace(/[.,]/g, ''), 10)
  }

  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (lastSep !== -1 && s.length - lastSep - 1 <= 2) {
    return parseInt(s.slice(0, lastSep).replace(/[.,]/g, ''), 10)
  }

  return parseInt(s.replace(/[.,]/g, ''), 10)
}

// Parses "02 de mayo de 2026" or "27 Abr. 2026" or "04 jun 2026"
// with optional time "03:18 pm" or "19:36"
export function parseSpanishDate(dateStr: string, timeStr?: string): string | null {
  const dm = dateStr.match(/(\d{1,2})\s+(?:de\s+)?(\w+)\.?\s+(?:de\s+)?(\d{4})/i)
  if (!dm) return null

  const day = parseInt(dm[1])
  const month = MESES[dm[2].toLowerCase()]
  const year = parseInt(dm[3])
  if (month === undefined || isNaN(day) || isNaN(year)) return null

  let hours = 0
  let minutes = 0
  if (timeStr) {
    const tm = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
    if (tm) {
      hours = parseInt(tm[1])
      minutes = parseInt(tm[2])
      const suffix = tm[3]?.toLowerCase()
      if (suffix === 'pm' && hours !== 12) hours += 12
      if (suffix === 'am' && hours === 12) hours = 0
    }
  }

  return bogotaDateToUTC(year, month, day, hours, minutes)
}

// Converts "BANCO CITIBANK COLOMBIA" → "Banco Citibank Colombia"
// Leaves already mixed-case strings (RappiCard, @handle, emails) untouched
const LOWERCASE_ES = new Set(['y', 'e', 'o', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'a', 'con', 'por', 'al'])

export function toTitleCase(str: string): string {
  if (!str) return str
  // Skip handles and email addresses
  if (str.startsWith('@') || str.includes('@')) return str
  // Skip already mixed-case (camelCase, PascalCase)
  if (str !== str.toUpperCase() && str !== str.toLowerCase()) return str
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => i > 0 && LOWERCASE_ES.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Parses "2026-06-07 12:25:21" or "2026-06-07" — hora de Bogotá, sin zona
export function parseISOLikeDate(s: string): string | null {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[\sT](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  return bogotaDateToUTC(
    parseInt(y), parseInt(mo) - 1, parseInt(d),
    h ? parseInt(h) : 0, mi ? parseInt(mi) : 0, se ? parseInt(se) : 0
  )
}
