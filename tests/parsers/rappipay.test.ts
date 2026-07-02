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

describe('parseRappiPay — recibo de contacto P2P', () => {
  const body = `
¡Hola, Brandon Nick!
Recibiste dinero de un contacto en RappiPay.

Aquí los detalles:

Monto recibido
$2.700.000

Tipo de transacción
Recibo de dinero

No. de contacto de origen
3112407799

Nombre de tu contacto
RAUL GOMEZ

No. de transacción
43966185

Fecha de la transacción
01 de julio de 2026

Hora de la transacción
11:08 am
`

  it('parsea recibo de dinero de contacto', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Recibiste dinero en tu RappiCuenta', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('TRANSFERENCIA_RECIBIDA')
    expect(result!.monto).toBe(2700000)
    expect(result!.comercio).toBe('Raul Gomez')
    expect(result!.fecha).toContain('2026-07-01')
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

describe('parseRappiPay — rentabilidad formato real (post-stripHtml, espacios)', () => {
  // Simula lo que produce stripHtml del email real de RappiPay
  const body = '¡Hola, Brandon Nick! Este es el resumen de la rentabilidad que ganaste este mes por ahorrar en tu cuenta: Aquí los detalles: Rentabilidad de Junio $46.596,43 Fecha de corte 30 de junio de 2026 Intereses retenidos $1.110,18'

  it('parsea rentabilidad con espacios (sin newlines)', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Rentabilidad mensual', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('INGRESO')
    expect(result!.monto).toBe(46596)
    expect(result!.subcategoria).toBe('rendimiento')
    expect(result!.comercio).toBe('RappiCuenta')
  })
})

describe('parseRappiPay — espacio entre $ y monto (HTML con spans separados)', () => {
  // Cuando el HTML tiene <span>$</span><span>203.770,46</span>, stripHtml produce "$ 203.770,46"
  it('parsea rentabilidad con espacio después del $', () => {
    const body = 'Rentabilidad de Abril $ 203.770,46 Fecha de corte 30 de abril de 2026'
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Rentabilidad mensual', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('INGRESO')
    expect(result!.monto).toBe(203770)
  })

  it('parsea transferencia recibida con espacio después del $', () => {
    const body = 'tu RappiCuenta Monto recibido $ 1.050.000 Banco Bancolombia Fecha de la transacción 02 de mayo de 2026'
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Tu dinero ya está disponible.', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('TRANSFERENCIA_RECIBIDA')
    expect(result!.monto).toBe(1050000)
  })

  it('parsea ingreso bancario con espacio después del $', () => {
    const body = 'Resumen transferencia bancaria Monto recibido $ 24.208.992 Banco BANCO CITIBANK COLOMBIA Fecha de la transacción 29 de abril de 2026'
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Resumen transferencia Bancaria', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('INGRESO')
    expect(result!.monto).toBe(24208992)
  })
})

describe('parseRappiPay — bolsillos (multi-word name)', () => {
  const body = `
Tu Bolsillo Navidad sigue generando

Rentabilidad de tu Bolsillo Navidad
$50.000
Fecha de corte
31 de mayo de 2026
`

  it('parses bolsillo yield', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Rentabilidad de tu Bolsillo', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('INGRESO')
    expect(result!.monto).toBe(50000)
    expect(result!.subcategoria).toBe('rendimiento')
  })

  it('comercio refleja el nombre del bolsillo sin "tu"', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Rentabilidad de tu Bolsillo', body })
    expect(result!.comercio).toMatch(/bolsillo navidad/i)
    expect(result!.comercio).not.toMatch(/^tu /i)
  })
})

describe('parseRappiPay — transferencia enviada formato real', () => {
  // Simula post-stripHtml del email real
  const body = '¡Tu transferencia fue enviada con éxito! La persona que tiene la llave que usaste, ya recibió el dinero sin ningún problema. ¡Sigue utilizando nuestras transferencias inmediatas! Aquí los detalles: Monto transferido $2.910.000,00 RappiCuenta de origen ****9514 Llave destino carlosfdezmo@me.com Cuenta destino ****848 ambas de rappicuenta'

  it('parsea transferencia enviada con monto grande', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Transferencia enviada', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(result!.monto).toBe(2910000)
    expect(result!.comercio).toBe('carlosfdezmo@me.com')
  })
})

describe('parseRappiPay — transferencia bancaria saliente', () => {
  const body = `
¡Hola, Brandon Nick !
Tu transferencia fue enviada con éxito.
Será procesada y aprobada por el banco de destino.

Aquí los detalles:

Monto transferido
$1.500.000

Banco
DAVIVIENDA

No. de transacción
12345678

Fecha de la transacción
29 de mayo de 2026

Hora de la transacción
02:15 pm
`

  it('parsea transferencia bancaria saliente como TRANSFERENCIA_ENVIADA', () => {
    const result = parseRappiPay({ ...BASE_EMAIL, subject: 'Resumen transferencia Bancaria', body })
    expect(result).not.toBeNull()
    expect(result!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(result!.monto).toBe(1500000)
    expect(result!.comercio).toBe('Davivienda')
  })
})

describe('parseRappiPay — emails ignorados', () => {
  it('ignora "Tu compra falló"', () => {
    const result = parseRappiPay({
      ...BASE_EMAIL,
      subject: 'Tu compra falló',
      body: 'Tu compra no se procesó. Monto $110.441,00 Tipo de transacción PSE',
    })
    expect(result).toBeNull()
  })

  it('ignora extracto de cuenta', () => {
    const result = parseRappiPay({
      ...BASE_EMAIL,
      subject: 'Extracto de RappiCuenta',
      body: 'Ya puedes consultar el extracto de tu cuenta.',
    })
    expect(result).toBeNull()
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
