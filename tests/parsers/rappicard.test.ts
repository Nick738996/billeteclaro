import { describe, it, expect } from 'vitest'
import { parseRappiCard } from '../../lib/parsers/rappicard'

const BASE_EMAIL = {
  id: 'msg_001',
  from: 'noreply@rappicard.co',
  date: '2026-06-07T12:00:00Z',
  banco: 'RAPPICARD' as const,
}

describe('parseRappiCard — parsePurchase', () => {
  const purchaseBody = `
Realizaste una compra

Monto
$17.934
Comercio
Uber
Fecha de la transacción
2026-06-07 12:25:21
¿No reconoces esta transacción?
`

  it('parses purchase with correct tipo and monto', () => {
    const result = parseRappiCard({ ...BASE_EMAIL, subject: 'Detalle de tu transacción', body: purchaseBody })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('COMPRA')
    expect(result!.monto).toBe(17934)
  })

  it('extracts comercio and guesses TRANSPORTE for Uber', () => {
    const result = parseRappiCard({ ...BASE_EMAIL, subject: 'Detalle de tu transacción', body: purchaseBody })
    expect(result!.comercio).toBe('Uber')
    expect(result!.categoria).toBe('TRANSPORTE')
  })

  it('extracts fecha from body', () => {
    const result = parseRappiCard({ ...BASE_EMAIL, subject: 'Detalle de tu transacción', body: purchaseBody })
    expect(result!.fecha).toContain('2026-06-07')
  })

  it('labels Rappi-only purchase as Rappi (app)', () => {
    const rappiBody = purchaseBody.replace('Uber', 'Rappi')
    const result = parseRappiCard({ ...BASE_EMAIL, subject: 'Realizaste una compra', body: rappiBody })
    expect(result!.comercio).toBe('Rappi (app)')
    expect(result!.categoria).toBe('SALIDAS')
  })

  it('returns null when monto is missing', () => {
    const body = 'Realizaste una compra\nComercio\nUber\nFecha de la transacción\n2026-06-07'
    const result = parseRappiCard({ ...BASE_EMAIL, subject: 'Realizaste una compra', body })
    expect(result).toBeNull()
  })
})

describe('parseRappiCard — parsePayment', () => {
  const paymentBody = `
Comprobante de pago

Monto
$114.184,57
Fecha y hora
04 jun 2026 15:20
`

  it('parses payment with ABONO_DEUDA tipo', () => {
    const result = parseRappiCard({ ...BASE_EMAIL, subject: 'Comprobante de pago', body: paymentBody })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('ABONO_DEUDA')
    expect(result!.monto).toBe(114184)
  })

  it('sets comercio as RappiCard', () => {
    const result = parseRappiCard({ ...BASE_EMAIL, subject: 'Comprobante de pago', body: paymentBody })
    expect(result!.comercio).toBe('RappiCard')
  })
})

describe('parseRappiCard — no match', () => {
  it('returns null for unrecognized email', () => {
    const result = parseRappiCard({
      ...BASE_EMAIL,
      subject: 'Bienvenido a RappiCard',
      body: 'Este es un correo de bienvenida.',
    })
    expect(result).toBeNull()
  })
})
