import { describe, it, expect } from 'vitest'
import { tryGenericParser } from '../../lib/parsers/generic'

const BASE_EMAIL = {
  id: 'msg_001',
  from: 'notificaciones@bbva.com.co',
  date: '2026-06-07T12:00:00Z',
}

describe('tryGenericParser — compra', () => {
  it('parses a generic purchase', () => {
    const body = 'Realizaste una compra por valor de $85.000 en Exito el 07 de junio de 2026 a las 14:30'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Notificación de compra', body }, 'BBVA')
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('COMPRA')
    expect(result!.monto).toBe(85000)
    expect(result!.comercio).toBe('Exito')
    expect(result!.flags).toContain('parser_generico')
  })
})

describe('tryGenericParser — transferencias', () => {
  it('parses a transferencia enviada', () => {
    const body = 'Transferiste $120.000 a Juan Perez el 07 de junio de 2026'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Transferencia realizada', body }, 'NEQUI')
    expect(result!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(result!.monto).toBe(120000)
  })

  it('parses a transferencia recibida', () => {
    const body = 'Recibiste una transferencia por valor de $700.000 el 07 de junio de 2026'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Transferencia recibida', body }, 'NU')
    expect(result!.tipo).toBe('TRANSFERENCIA_RECIBIDA')
    expect(result!.monto).toBe(700000)
  })
})

describe('tryGenericParser — retiro', () => {
  it('parses a cash withdrawal', () => {
    const body = 'Realizaste un retiro en cajero por valor de $200.000 el 07 de junio de 2026'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Retiro en cajero', body }, 'BANCO_DE_BOGOTA')
    expect(result!.tipo).toBe('RETIRO')
    expect(result!.monto).toBe(200000)
  })
})

describe('tryGenericParser — pago de servicio', () => {
  it('parses a service payment', () => {
    const body = 'Realizaste el pago de servicio por valor de $95.000 el 07 de junio de 2026'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Pago de servicio exitoso', body }, 'LULO_BANK')
    expect(result!.tipo).toBe('PAGO_SERVICIO')
    expect(result!.monto).toBe(95000)
  })
})

describe('tryGenericParser — ingreso', () => {
  it('parses a rentabilidad/yield notification', () => {
    const body = 'Tu rentabilidad de este mes fue de $12.500'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Rentabilidad generada', body }, 'NU')
    expect(result!.tipo).toBe('INGRESO')
    expect(result!.monto).toBe(12500)
  })
})

describe('tryGenericParser — abono de deuda (prioridad sobre compra)', () => {
  it('does not mistake a card payment confirmation for a purchase', () => {
    const body = 'Recibimos el pago de tu tarjeta por valor de $300.000'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Comprobante de pago', body }, 'ITAU')
    expect(result!.tipo).toBe('ABONO_DEUDA')
  })
})

describe('tryGenericParser — casos sin certeza suficiente', () => {
  it('returns null when there is no recognizable tipo', () => {
    const body = 'Tu estado de cuenta mensual ya está disponible. Saldo actual: $1.200.000'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Estado de cuenta', body }, 'BBVA')
    expect(result).toBeNull()
  })

  it('returns null when there is no monto', () => {
    const body = 'Realizaste una compra en Exito el 07 de junio de 2026'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Notificación de compra', body }, 'BBVA')
    expect(result).toBeNull()
  })

  it('returns null for an unrelated email', () => {
    const body = 'Bienvenido a tu nueva cuenta. Estamos felices de tenerte con nosotros.'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Bienvenido', body }, 'BBVA')
    expect(result).toBeNull()
  })
})

describe('tryGenericParser — inglés (bancos extranjeros)', () => {
  it('parses a purchase notification in English, amount in US format', () => {
    const body = 'A purchase was made using your debit card.\n\nAmount: $1,234.56\nMerchant: STARBUCKS STORE #4521\nDate: September 4, 2026 11:58 AM'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Your purchase with Bank of America', body }, 'OTRO')
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('COMPRA')
    expect(result!.monto).toBe(1234.56)
    expect(result!.moneda).toBe('USD')
    expect(result!.monto_usd).toBe(1234.56)
    expect(result!.comercio).toBe('Starbucks Store #4521')
    expect(result!.flags).toContain('parser_generico')
  })

  it('parses a transfer sent notification in English', () => {
    const body = 'You sent a transfer of $500.00 to John Smith on August 20, 2026.'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Transfer sent', body }, 'OTRO')
    expect(result!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(result!.monto).toBe(500)
    expect(result!.moneda).toBe('USD')
  })

  it('parses a transfer received notification in English', () => {
    const body = 'You received a transfer of $2,000.00 from Jane Doe.'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Transfer received', body }, 'OTRO')
    expect(result!.tipo).toBe('TRANSFERENCIA_RECIBIDA')
    expect(result!.monto).toBe(2000)
  })

  it('parses a withdrawal notification in English', () => {
    const body = 'A cash withdrawal of $100.00 was made from your account.'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'ATM withdrawal', body }, 'OTRO')
    expect(result!.tipo).toBe('RETIRO')
    expect(result!.monto).toBe(100)
  })

  it('does not mistake a card payment confirmation for a purchase (English)', () => {
    const body = 'We received your payment of $300.00 to your account.'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Payment received', body }, 'OTRO')
    expect(result!.tipo).toBe('ABONO_DEUDA')
  })

  it('returns null for an English email with no recognizable tipo', () => {
    const body = 'Your monthly statement is now available online. Current balance: $1,200.00'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Statement available', body }, 'OTRO')
    expect(result).toBeNull()
  })

  it('prefers the Spanish match over English when both could apply', () => {
    // Texto en español real — no debe intentar el camino inglés ni confundir el monto.
    const body = 'Realizaste una compra por valor de $85.000 en Exito.'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Compra', body }, 'BBVA')
    expect(result!.moneda).toBe('COP')
    expect(result!.monto).toBe(85000)
  })
})

describe('tryGenericParser — tabla COMERCIO/MONTO/FECHA/HORA', () => {
  it('parsea una tabla real de Scotiabank Colpatria (reenvío doble, ya limpio)', () => {
    const body = `*Apreciado(a) Cliente: *

Scotiabank Colpatria notifica que el día de hoy realizaste con tu tarjeta Visa
Platinum la siguiente transacción o compra recurrente:

*COMERCIO* *MONTO* *FECHA* *HORA*
DL*DIDI RIDES CO 9,200 2025/03/06 18:09:09

Si requieres más información, contáctanos en nuestros canales de atención`
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Scotiabank Colpatria en Linea', body }, 'SCOTIABANK_COLPATRIA')
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('COMPRA')
    expect(result!.monto).toBe(9200)
    expect(result!.comercio).toBe('Dl*didi Rides Co')
    expect(result!.moneda).toBe('COP')
    expect(result!.flags).toContain('parser_tabla')
    expect(result!.fecha).toBe(new Date(Date.UTC(2025, 2, 6, 23, 9, 9)).toISOString())
  })

  it('acepta fecha en formato dd/mm/yyyy', () => {
    const body = `COMERCIO MONTO FECHA HORA
Exito 45000 06/03/2025 10:00:00`
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Notificación', body }, 'OTRO')
    expect(result!.monto).toBe(45000)
    expect(result!.comercio).toBe('Exito')
  })

  it('funciona sin la columna HORA', () => {
    const body = `COMERCIO MONTO FECHA
Netflix 32900 2025/03/06`
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Notificación', body }, 'OTRO')
    expect(result!.monto).toBe(32900)
    expect(result!.comercio).toBe('Netflix')
  })

  it('no confunde un encabezado suelto sin fila de datos válida', () => {
    const body = 'COMERCIO MONTO FECHA HORA\nEsto no es una fila de datos válida'
    const result = tryGenericParser({ ...BASE_EMAIL, subject: 'Notificación', body }, 'OTRO')
    expect(result).toBeNull()
  })
})

describe('tryGenericParser — fecha numérica dd/mm/yyyy', () => {
  it('usa la fecha real de la transacción, no la fecha del correo', () => {
    const body = 'Compraste $6.790,00 en UBER *TRIP con tu T.Deb *1754, el 18/04/2025 a las 14:05.'
    const result = tryGenericParser(
      { ...BASE_EMAIL, subject: 'Compra', body, date: '2026-09-04T16:47:00Z' },
      'OTRO'
    )
    expect(result!.monto).toBe(6790)
    expect(result!.fecha).not.toBeNull()
    expect(result!.fecha!.startsWith('2025-04-18')).toBe(true)
  })
})
