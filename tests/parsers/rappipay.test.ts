import { describe, it, expect } from 'vitest'
import { parseRappiPay } from '../../lib/parsers/rappipay'

const BASE_EMAIL = {
  id: 'msg_001',
  from: 'noreply@rappipay.co',
  date: '2026-06-07T10:00:00Z',
  banco: 'RAPPIPAY' as const,
}

describe('parseRappiPay — transferencia recibida', () => {
  const body = `
Ya está disponible en tu RappiCuenta

Monto recibido
$500.000
Banco
Bancolombia
Nro. de referencia 12345
Fecha de la transacción
07 de junio de 2026
Hora de la transacción
10:30 am
`

  it('parses received transfer', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Transferencia recibida', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('TRANSFERENCIA_RECIBIDA')
    expect(result!.monto).toBe(500000)
    expect(result!.comercio).toBe('Bancolombia')
  })
})

describe('parseRappiPay — transferencia enviada', () => {
  const body = `
Tu dinero está en camino

Monto transferido
$150.000
Llave destino
@juanperez
Fecha de la transacción
07 de junio de 2026
Hora de la transacción
2:00 pm
`

  it('parses sent transfer', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Transferencia enviada', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(result!.monto).toBe(150000)
    expect(result!.comercio).toBe('@juanperez')
  })
})

describe('parseRappiPay — ingreso bancario (sueldo)', () => {
  const body = `
Resumen transferencia bancaria

Monto recibido
$10.254.616
Banco
BANCO CITIBANK COLOMBIA
No. de transacción 9876543
Fecha de la transacción
28 de mayo de 2026
Hora de la transacción
09:40 am
`

  it('parses bank income with toTitleCase on comercio', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Resumen transferencia bancaria', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('INGRESO')
    expect(result!.monto).toBe(10254616)
    expect(result!.comercio).toBe('Banco Citibank Colombia')
  })

  it('sets fecha from body', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Resumen transferencia bancaria', body })
    expect(result!.fecha).toContain('2026-05-28')
  })
})

describe('parseRappiPay — pago de servicio', () => {
  const body = `
Resumen pago de servicio

Pago total
$120.000
Convenio
ENEL
Referencia 11111
Fecha y hora
19:36 hrs, 27 Abr. 2026
`

  it('parses service payment', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Resumen pago de servicio', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('PAGO_SERVICIO')
    expect(result!.monto).toBe(120000)
    expect(result!.comercio).toBe('Enel')
    expect(result!.categoria).toBe('HOGAR')
  })
})

describe('parseRappiPay — rentabilidad', () => {
  const body = `
Tu RappiCuenta sigue generando

Rentabilidad de Abril
$203.770,46
Fecha de corte
30 de abril de 2026
`

  it('parses monthly yield', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Rentabilidad mensual', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('INGRESO')
    expect(result!.monto).toBe(203770)
    expect(result!.subcategoria).toBe('rendimiento')
  })
})

describe('parseRappiPay — compra con PSE', () => {
  const bodyETB = `
¡Hola, Brandon Nick!

Te compartimos toda la información de tu compra.

Monto
$22.450,00

CUS (Código de transacción)
384659088

RappiCuenta de origen
149739514

Comercio
EMPRESA DE TELECOMUNICACIONES DE BOGOTA S. A. E.S.P

Tipo de transacción
PSE

Número de aprobación
3561150

Fecha de la transacción
12 de junio de 2026

Hora de la transacción
09:46 am
`

  const bodyFondo = `
¡Hola, Brandon Nick!

Monto
$1.382.000,00

Comercio
Fondo de Inversion Colectiva Consolidar

Tipo de transacción
PSE

Fecha de la transacción
13 de junio de 2026

Hora de la transacción
07:53 pm
`

  it('parses PSE purchase from subject', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Resumen compra con Pse', body: bodyETB })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('COMPRA')
    expect(result!.monto).toBe(22450)
    expect(result!.comercio).toBe('Empresa de Telecomunicaciones de Bogota S. A. E.s.p')
    expect(result!.banco).toBe('RAPPIPAY')
  })

  it('parses PSE purchase with large amount', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Resumen compra con Pse', body: bodyFondo })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('COMPRA')
    expect(result!.monto).toBe(1382000)
  })

  it('parses PSE purchase from body fallback when subject is different', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Confirmación de pago', body: bodyETB })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('COMPRA')
  })

  it('sets fecha from body', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Resumen compra con Pse', body: bodyETB })
    expect(result!.fecha).toContain('2026-06-12')
  })
})

describe('parseRappiPay — no match', () => {
  it('returns null for promotional email', () => {
    const result = parseRappiPay({
      ...BASE_EMAIL,
      subject: 'Oferta especial para ti',
      body: 'Aprovecha nuestras ofertas exclusivas.',
    })
    expect(result).toBeNull()
  })
})
