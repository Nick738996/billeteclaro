import { describe, it, expect } from 'vitest'
import { parseUniversal } from '../../lib/parsers/universal'

const BASE = {
  id: 'msg_test',
  from: 'brandon7389@gmail.com',
  date: '2026-06-28T10:00:00Z',
}

// ── Davivienda ───────────────────────────────────────────────────────────────

describe('Davivienda', () => {
  it('compra con débito — formato clásico', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta Davivienda',
      body: 'Se realizó un débito de $50.000 en su cuenta Ahorros terminada en 1234 en EXITO el 28/06/2026 a las 10:30',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('COMPRA')
    expect(r!.monto).toBe(50000)
    expect(r!.banco).toBe('OTRO')
  })

  it('compra — monto con punto como separador de miles', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta de movimiento',
      body: 'Tu Tarjeta Davivienda realizó una compra por $1.250.000 en ALKOSTO el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('COMPRA')
    expect(r!.monto).toBe(1250000)
    expect(r!.comercio).toBe('Alkosto')
  })

  it('extrae comercio ignorando "en su cuenta"', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta Davivienda',
      body: 'Se realizó un débito de $85.000 en su cuenta corriente terminada en 9876 en CARULLA el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.comercio).toBe('Carulla')
  })

  it('transferencia enviada', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Transferencia Davivienda',
      body: 'Transferencia enviada por $200.000 a Juan Carlos Perez el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(r!.monto).toBe(200000)
  })

  it('retiro en cajero', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Retiro cajero Davivienda',
      body: 'Realizaste un retiro de $300.000 en cajero Davivienda el 28/06/2026 a las 09:15',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('RETIRO')
    expect(r!.monto).toBe(300000)
  })

  it('consignación / ingreso — subject neutro', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta Davivienda',
      body: 'Consignación de $2.500.000 en tu cuenta de ahorros terminada en 1234 el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('INGRESO')
    expect(r!.monto).toBe(2500000)
  })

  it('consignación recibida — subject con "recibida" clasifica como transferencia recibida (ambos válidos)', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Consignación recibida',
      body: 'Consignación de $2.500.000 recibida en tu cuenta terminada en 1234 el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(['INGRESO', 'TRANSFERENCIA_RECIBIDA']).toContain(r!.tipo)
    expect(r!.monto).toBe(2500000)
  })

  it('descarta email de OTP', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Tu código Davivienda',
      body: 'Tu código de verificación es 123456. No lo compartas.',
    })
    expect(r).toBeNull()
  })
})

// ── BBVA Colombia ────────────────────────────────────────────────────────────

describe('BBVA Colombia', () => {
  it('compra con tarjeta', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta BBVA',
      body: 'Has realizado una compra por $85.000 en CARULLA con tu tarjeta terminada en 5678 el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('COMPRA')
    expect(r!.monto).toBe(85000)
    expect(r!.comercio).toBe('Carulla')
  })

  it('transferencia enviada', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Transferencia BBVA',
      body: 'Has enviado $150.000 a Maria Lopez el 28/06/2026 a las 14:25',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(r!.monto).toBe(150000)
  })

  it('retiro ATM', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Retiro BBVA',
      body: 'Retiro ATM por $400.000 en cajero Bancolombia el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('RETIRO')
    expect(r!.monto).toBe(400000)
  })
})

// ── Nu Colombia ──────────────────────────────────────────────────────────────

describe('Nu Colombia', () => {
  it('compra — patrón "Usaste $X en COMERCIO"', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Usaste $17.000',
      body: 'Usaste $17.000 en Rappi el 28 jun 2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('COMPRA')
    expect(r!.monto).toBe(17000)
    expect(r!.comercio).toBe('Rappi')
  })

  it('compra — monto con coma como separador decimal', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Compra Nu',
      body: 'Usaste $32.500 en NETFLIX el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('COMPRA')
    expect(r!.monto).toBe(32500)
  })

  it('transferencia enviada', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Transferencia Nu',
      body: 'Transferiste $75.000 a Carlos Andres Gomez el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(r!.monto).toBe(75000)
  })

  it('transferencia recibida', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Recibiste dinero',
      body: 'Recibiste $50.000 de Laura Sanchez el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('TRANSFERENCIA_RECIBIDA')
    expect(r!.monto).toBe(50000)
  })
})

// ── Nequi ────────────────────────────────────────────────────────────────────

describe('Nequi', () => {
  it('transferencia enviada — "Enviaste $X a NOMBRE"', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Enviaste plata con Nequi',
      body: 'Enviaste $50.000 a Maria Garcia el 28/06/2026 a las 11:00',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('TRANSFERENCIA_ENVIADA')
    expect(r!.monto).toBe(50000)
  })

  it('transferencia recibida — "Recibiste $X de NOMBRE"', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Recibiste plata con Nequi',
      body: 'Recibiste $30.000 de Pedro Rodriguez el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('TRANSFERENCIA_RECIBIDA')
    expect(r!.monto).toBe(30000)
  })

  it('pago en comercio — "Pagaste $X en COMERCIO"', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Pagaste con Nequi',
      body: 'Pagaste $25.000 en FARMACIA COLSUBSIDIO el 28/06/2026 a las 08:45',
    })
    expect(r).not.toBeNull()
    expect(r!.monto).toBe(25000)
    // pagaste en comercio puede clasificarse como COMPRA o PAGO_SERVICIO
    expect(['COMPRA', 'PAGO_SERVICIO', 'TRANSFERENCIA_ENVIADA']).toContain(r!.tipo)
  })

  it('retiro', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Retiro Nequi',
      body: 'Retiraste $100.000 el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('RETIRO')
    expect(r!.monto).toBe(100000)
  })
})

// ── Banco de Bogotá ──────────────────────────────────────────────────────────

describe('Banco de Bogotá', () => {
  it('compra con tarjeta débito', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta Banco de Bogotá',
      body: 'Compra realizada por $45.000 en JUMBO con tu tarjeta débito terminada en 0001 el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('COMPRA')
    expect(r!.monto).toBe(45000)
    expect(r!.comercio).toBe('Jumbo')
  })

  it('pago PSE', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Pago PSE Banco de Bogotá',
      body: 'Pago por PSE de $89.900 a EPM el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('PAGO_SERVICIO')
    expect(r!.monto).toBe(89900)
  })
})

// ── Casos edge ───────────────────────────────────────────────────────────────

describe('Casos edge', () => {
  it('descarta email sin monto', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta de seguridad',
      body: 'Detectamos un inicio de sesión en tu cuenta desde un nuevo dispositivo.',
    })
    expect(r).toBeNull()
  })

  it('descarta email promocional aunque tenga monto', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Oferta especial',
      body: 'Obtén hasta $50.000 de descuento en tu próxima compra. Descuento de hasta 30%.',
    })
    expect(r).toBeNull()
  })

  it('monto con punto como miles: $1.234.567', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Compra aprobada',
      body: 'Se realizó una compra por $1.234.567 en FALABELLA el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.monto).toBe(1234567)
  })

  it('monto con coma como miles: $1,234,567', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Compra aprobada',
      body: 'Transacción aprobada por $1,234,567 en LIVERPOOL el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.monto).toBe(1234567)
  })

  it('fecha en formato ISO', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta',
      body: 'Compra por $20.000 en OXXO el 2026-06-28',
    })
    expect(r).not.toBeNull()
    expect(r!.fecha).toContain('2026-06-28')
  })

  it('fecha en formato español', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Alerta',
      body: 'Compra por $20.000 en OXXO el 28 de junio de 2026',
    })
    expect(r).not.toBeNull()
    expect(r!.fecha).toContain('2026-06-28')
  })

  it('banco siempre es OTRO', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Compra',
      body: 'Compra por $10.000 en TIGO el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.banco).toBe('OTRO')
  })

  it('abono a deuda', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Pago tarjeta',
      body: 'Abono a tu tarjeta de crédito por $500.000 el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('ABONO_DEUDA')
    expect(r!.categoria).toBe('DEUDA')
  })

  it('nómina / sueldo → INGRESO', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Pago de nómina',
      body: 'Pago de nómina por $3.500.000 acreditado en tu cuenta el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('INGRESO')
    expect(r!.categoria).toBe('INGRESO')
  })

  it('débito automático → PAGO_SERVICIO', () => {
    const r = parseUniversal({
      ...BASE,
      subject: 'Débito automático',
      body: 'Débito automático de $45.900 a SPOTIFY el 28/06/2026',
    })
    expect(r).not.toBeNull()
    expect(r!.tipo).toBe('PAGO_SERVICIO')
  })
})
