import { describe, it, expect } from 'vitest'
import { parseBancolombia, parseMontoBancolombia } from '@/lib/parsers/bancolombia'

const BASE_EMAIL = {
  id: 'msg1',
  from: 'alertasynotificaciones@an.notificacionesbancolombia.com',
  subject: 'Alertas y Notificaciones',
  date: '2026-06-07T08:07:00Z',
}

// ── parseMontoBancolombia ──────────────────────────────────────────────────────

describe('parseMontoBancolombia', () => {
  it('formato norteamericano: coma=miles, punto=decimal', () => {
    expect(parseMontoBancolombia('$120,000.00')).toBe(120000)
  })
  it('formato colombiano: punto=miles, coma=decimal', () => {
    expect(parseMontoBancolombia('$6.790,00')).toBe(6790)
  })
  it('sin decimales, coma=miles', () => {
    expect(parseMontoBancolombia('$130,000')).toBe(130000)
  })
  it('múltiples puntos = separador de miles', () => {
    expect(parseMontoBancolombia('$10.254.616')).toBe(10254616)
  })
  it('sin separadores', () => {
    expect(parseMontoBancolombia('$6000')).toBe(6000)
  })
})

// ── parseBancolombia ──────────────────────────────────────────────────────────

describe('parseBancolombia — compra con tarjeta débito', () => {
  const email = {
    ...BASE_EMAIL,
    body: 'Bancolombia: Compraste $6.790,00 en UBER *TRIP con tu T.Deb *1754, el 18/04/2025 a las 14:05. Si tienes dudas, encuentranos aqui: 6045109095.',
  }

  it('retorna resultado', () => {
    expect(parseBancolombia(email)).not.toBeNull()
  })

  it('extrae monto correctamente', () => {
    expect(parseBancolombia(email)?.monto).toBe(6790)
  })

  it('extrae fecha con hora', () => {
    expect(parseBancolombia(email)?.fecha).toBe('2025-04-18T14:05:00')
  })

  it('limpia asterisco del comercio y aplica toTitleCase', () => {
    expect(parseBancolombia(email)?.comercio).toBe('Uber Trip')
  })

  it('tipo = COMPRA', () => {
    expect(parseBancolombia(email)?.tipo).toBe('COMPRA')
  })

  it('banco = BANCOLOMBIA', () => {
    expect(parseBancolombia(email)?.banco).toBe('BANCOLOMBIA')
  })
})

describe('parseBancolombia — transferencia enviada', () => {
  const email = {
    ...BASE_EMAIL,
    body: 'Bancolombia: Transferiste $120,000.00 desde tu cuenta 2997 a la cuenta *3232989410 el 07/06/2026 a las 08:07. ¿Dudas? Llamanos al 018000931987.',
  }

  it('retorna resultado', () => {
    expect(parseBancolombia(email)).not.toBeNull()
  })

  it('extrae monto', () => {
    expect(parseBancolombia(email)?.monto).toBe(120000)
  })

  it('extrae fecha con hora', () => {
    expect(parseBancolombia(email)?.fecha).toBe('2026-06-07T08:07:00')
  })

  it('tipo = TRANSFERENCIA_ENVIADA', () => {
    expect(parseBancolombia(email)?.tipo).toBe('TRANSFERENCIA_ENVIADA')
  })

  it('categoria = TRANSFERENCIA', () => {
    expect(parseBancolombia(email)?.categoria).toBe('TRANSFERENCIA')
  })
})

describe('parseBancolombia — transferencia recibida', () => {
  const email = {
    ...BASE_EMAIL,
    body: 'Bancolombia: Recibiste una transferencia por $130,000 de ERNESTO CASTELLANOS en tu cuenta **2997, el 06/06/2026 a las 10:59. Si tienes dudas, hablemos: 018000931987.',
  }

  it('retorna resultado', () => {
    expect(parseBancolombia(email)).not.toBeNull()
  })

  it('extrae monto', () => {
    expect(parseBancolombia(email)?.monto).toBe(130000)
  })

  it('extrae nombre del remitente con toTitleCase', () => {
    expect(parseBancolombia(email)?.comercio).toBe('Ernesto Castellanos')
  })

  it('tipo = TRANSFERENCIA_RECIBIDA', () => {
    expect(parseBancolombia(email)?.tipo).toBe('TRANSFERENCIA_RECIBIDA')
  })

  it('categoria = INGRESO (no TRANSFERENCIA)', () => {
    expect(parseBancolombia(email)?.categoria).toBe('INGRESO')
  })
})

describe('parseBancolombia — pago código QR', () => {
  const email = {
    ...BASE_EMAIL,
    body: 'Bancolombia: BRANDON NICK GOMEZ AYA pagaste $6,000.00 por codigo QR desde tu cuenta *2997 a la llave 0091322191 el 25/05/2026 a las 16:16. Con codigo QR es facil.',
  }

  it('retorna resultado', () => {
    expect(parseBancolombia(email)).not.toBeNull()
  })

  it('extrae monto', () => {
    expect(parseBancolombia(email)?.monto).toBe(6000)
  })

  it('extrae fecha', () => {
    expect(parseBancolombia(email)?.fecha).toBe('2026-05-25T16:16:00')
  })

  it('tipo = PAGO_SERVICIO', () => {
    expect(parseBancolombia(email)?.tipo).toBe('PAGO_SERVICIO')
  })

  it('descripcion = Pago código QR', () => {
    expect(parseBancolombia(email)?.descripcion).toBe('Pago código QR')
  })
})

describe('parseBancolombia — email no transaccional', () => {
  it('retorna null para correo genérico', () => {
    const email = {
      ...BASE_EMAIL,
      body: 'Bienvenido a Bancolombia. Tu cuenta ha sido activada.',
    }
    expect(parseBancolombia(email)).toBeNull()
  })
})
