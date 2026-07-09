import { describe, it, expect } from 'vitest'
import { parseDavibank } from '../../lib/parsers/davibank'

const BASE = {
  id: 'msg_davi',
  from: 'davibankinforma@davibank.com',
  date: '2026-06-23T20:46:00Z',
}

// Email cuerpo simulando stripHtml (tabla HTML colapsada a texto plano)
function davi(comercio: string, monto: string, fecha: string, hora: string) {
  return `Apreciado(a) Cliente: DAVIbank te notifica que el día de hoy realizaste con tu tarjeta Visa Platinum la siguiente transacción: Comercio ${comercio} Monto ${monto} Fecha ${fecha} Hora ${hora} Si requieres más información contáctanos.`
}

describe('parseDavibank', () => {
  it('ejemplo 1 — BW BUFFALO WINGS ILARC $236.500', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('BW BUFFALO WINGS ILARC', '236,500', '2026/06/23', '20:46:39'),
    })
    expect(r).not.toBeNull()
    expect(r!.banco).toBe('DAVIVIENDA')
    expect(r!.tipo).toBe('COMPRA')
    expect(r!.monto).toBe(236500)
    expect(r!.comercio).toBe('Bw Buffalo Wings Ilarc')
    // 20:46 hora Bogotá (UTC-5) → 2026-06-24T01:46 UTC
    expect(r!.fecha).toBe('2026-06-24T01:46:00.000Z')
  })

  it('ejemplo 2 — SIBAR S.A.S $97.250', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('SIBAR S.A.S', '97,250', '2026/06/23', '16:23:26'),
    })
    expect(r).not.toBeNull()
    expect(r!.monto).toBe(97250)
    expect(r!.banco).toBe('DAVIVIENDA')
    expect(r!.fecha).toContain('2026-06-23')
  })

  it('ejemplo 3 — BOGOTA (retiro/ATM) $36.000', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('BOGOTA', '36,000', '2026/06/14', '17:00:45'),
    })
    expect(r).not.toBeNull()
    expect(r!.monto).toBe(36000)
    expect(r!.comercio).toBe('Bogota')
  })

  it('ejemplo 4 — BUTCHERY SHOPQ1 $58.800', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('BUTCHERY SHOPQ1', '58,800', '2026/06/14', '12:27:05'),
    })
    expect(r).not.toBeNull()
    expect(r!.monto).toBe(58800)
  })

  it('ejemplo 5 — BODEGA AUREA COCINA Y VINO $40.600', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('BODEGA AUREA COCINA Y VINO', '40,600', '2026/06/07', '13:50:27'),
    })
    expect(r).not.toBeNull()
    expect(r!.monto).toBe(40600)
    expect(r!.comercio).toBe('Bodega Aurea Cocina y Vino')
    expect(r!.fecha).toContain('2026-06-07')
  })

  it('extrae hora con dos dígitos correctamente', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('EXITO', '120,000', '2026/06/20', '09:15:33'),
    })
    // 09:15 hora Bogotá (UTC-5) → 14:15 UTC
    expect(r!.fecha).toContain('14:15')
  })

  it('extrae hora con un solo dígito — "9:09:25"', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('FRUVER EL GRAN JARDIN', '33,809', '2026/06/23', '9:09:25'),
    })
    expect(r).not.toBeNull()
    // 9:09 hora Bogotá (UTC-5) → 14:09 UTC, mismo día
    expect(r!.fecha).toContain('2026-06-23')
    expect(r!.fecha).toContain('T14:09')
    expect(r!.monto).toBe(33809)
  })

  it('retorna null si no hay monto', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: 'Apreciado(a) Cliente: actualización de tu cuenta DAVIbank.',
    })
    expect(r).toBeNull()
  })

  it('retorna null si no hay campo Comercio ni Monto', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: 'Tu código de verificación es 123456. No lo compartas.',
    })
    expect(r).toBeNull()
  })

  it('monto sin decimales — "120,000" → 120000', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('JUMBO', '120,000', '2026/06/20', '10:00:00'),
    })
    expect(r!.monto).toBe(120000)
  })

  it('monto millones — "1,250,000" → 1250000', () => {
    const r = parseDavibank({
      ...BASE,
      subject: 'DAVIbank en Linea',
      body: davi('ALKOSTO', '1,250,000', '2026/06/20', '14:30:00'),
    })
    expect(r!.monto).toBe(1250000)
  })
})
