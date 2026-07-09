import { describe, it, expect } from 'vitest'
import { parseCOPAmount, parseSpanishDate, toTitleCase, parseISOLikeDate } from '../../lib/parsers/utils'

describe('parseCOPAmount', () => {
  it('parses amount with thousands dots only', () => {
    expect(parseCOPAmount('17.934')).toBe(17934)
    expect(parseCOPAmount('500.000')).toBe(500000)
    expect(parseCOPAmount('1.254.616')).toBe(1254616)
    expect(parseCOPAmount('10.254.616')).toBe(10254616)
  })

  it('strips decimal cents (dot+comma)', () => {
    expect(parseCOPAmount('114.184,57')).toBe(114184)
    expect(parseCOPAmount('203.770,46')).toBe(203770)
  })

  it('parses plain integer string', () => {
    expect(parseCOPAmount('1500')).toBe(1500)
    expect(parseCOPAmount('120000')).toBe(120000)
  })

  it('trims whitespace', () => {
    expect(parseCOPAmount('  50.000  ')).toBe(50000)
  })
})

describe('parseSpanishDate', () => {
  it('parses "dd de mes de yyyy"', () => {
    const result = parseSpanishDate('07 de junio de 2026')
    expect(result).not.toBeNull()
    expect(result!).toContain('2026-06-07')
  })

  it('parses abbreviated month with time', () => {
    const result = parseSpanishDate('04 jun 2026', '15:20')
    expect(result).not.toBeNull()
    expect(result!.startsWith('2026-06-04')).toBe(true)
  })

  it('handles abbreviated month with dot (Abr.) — hora Bogotá (UTC-5)', () => {
    const result = parseSpanishDate('27 Abr. 2026', '19:36')
    expect(result).not.toBeNull()
    const d = new Date(result!)
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(3)  // April = 3
    expect(d.getUTCDate()).toBe(28)  // 19:36-05 → 00:36 UTC, ya es el día siguiente
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(36)
  })

  it('converts 12h pm time correctly — hora Bogotá (UTC-5)', () => {
    const result = parseSpanishDate('28 de mayo de 2026', '03:18 pm')
    expect(result).not.toBeNull()
    const d = new Date(result!)
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(4)   // May = 4
    expect(d.getUTCDate()).toBe(28)
    expect(d.getUTCHours()).toBe(20)  // 3pm Bogotá = 20h UTC
    expect(d.getUTCMinutes()).toBe(18)
  })

  it('converts 12h am midnight correctly — hora Bogotá (UTC-5)', () => {
    const result = parseSpanishDate('01 de enero de 2026', '12:00 am')
    expect(result).not.toBeNull()
    const d = new Date(result!)
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(0)   // January = 0
    expect(d.getUTCDate()).toBe(1)
    expect(d.getUTCHours()).toBe(5)   // medianoche Bogotá = 05h UTC
    expect(d.getUTCMinutes()).toBe(0)
  })

  it('returns null for invalid input', () => {
    expect(parseSpanishDate('not a date')).toBeNull()
  })
})

describe('toTitleCase', () => {
  it('converts ALLCAPS to Title Case', () => {
    expect(toTitleCase('BANCO CITIBANK COLOMBIA')).toBe('Banco Citibank Colombia')
    expect(toTitleCase('ENEL')).toBe('Enel')
  })

  it('leaves mixed-case (PascalCase) unchanged', () => {
    expect(toTitleCase('RappiCard')).toBe('RappiCard')
  })

  it('leaves @handles unchanged', () => {
    expect(toTitleCase('@juanperez')).toBe('@juanperez')
  })

  it('lowercases Spanish articles in middle of phrase', () => {
    const result = toTitleCase('DROGAS LA REBAJA')
    expect(result).toBe('Drogas la Rebaja')
  })

  it('returns empty string unchanged', () => {
    expect(toTitleCase('')).toBe('')
  })
})

describe('parseISOLikeDate', () => {
  it('parses ISO date string with time', () => {
    const result = parseISOLikeDate('2026-06-07 12:25:21')
    expect(result).not.toBeNull()
    expect(result!.startsWith('2026-06-07')).toBe(true)
  })

  it('parses date-only ISO string', () => {
    const result = parseISOLikeDate('2026-06-07')
    expect(result).not.toBeNull()
    expect(result!.startsWith('2026-06-07')).toBe(true)
  })

  it('returns null for non-matching string', () => {
    expect(parseISOLikeDate('not a date')).toBeNull()
  })
})
