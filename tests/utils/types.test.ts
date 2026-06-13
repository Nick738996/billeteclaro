import { describe, it, expect } from 'vitest'
import { isIngreso, isGasto, formatCOPCompact } from '@/lib/types'
import type { TipoTransaccion } from '@/lib/types'

describe('isIngreso', () => {
  it('INGRESO → true', () => {
    expect(isIngreso('INGRESO')).toBe(true)
  })

  it('TRANSFERENCIA_RECIBIDA → true', () => {
    expect(isIngreso('TRANSFERENCIA_RECIBIDA')).toBe(true)
  })

  it('COMPRA → false', () => {
    expect(isIngreso('COMPRA')).toBe(false)
  })

  it('TRANSFERENCIA_ENVIADA → false', () => {
    expect(isIngreso('TRANSFERENCIA_ENVIADA')).toBe(false)
  })

  it('ABONO_DEUDA → false', () => {
    expect(isIngreso('ABONO_DEUDA')).toBe(false)
  })
})

describe('isGasto', () => {
  it('COMPRA → true', () => {
    expect(isGasto('COMPRA')).toBe(true)
  })

  it('PAGO_SERVICIO → true', () => {
    expect(isGasto('PAGO_SERVICIO')).toBe(true)
  })

  it('TRANSFERENCIA_ENVIADA → true', () => {
    expect(isGasto('TRANSFERENCIA_ENVIADA')).toBe(true)
  })

  it('RETIRO → true', () => {
    expect(isGasto('RETIRO')).toBe(true)
  })

  it('INGRESO → false', () => {
    expect(isGasto('INGRESO')).toBe(false)
  })

  it('TRANSFERENCIA_RECIBIDA → false', () => {
    expect(isGasto('TRANSFERENCIA_RECIBIDA')).toBe(false)
  })

  it('ABONO_DEUDA → false (pago de tarjeta, no es gasto real)', () => {
    expect(isGasto('ABONO_DEUDA')).toBe(false)
  })

  it('isGasto e isIngreso son mutuamente excluyentes para ABONO_DEUDA', () => {
    const tipo: TipoTransaccion = 'ABONO_DEUDA'
    expect(isGasto(tipo)).toBe(false)
    expect(isIngreso(tipo)).toBe(false)
  })

  describe('con categoria (Feature 7/8 — AHORROS y PRESTAMO)', () => {
    it('COMPRA con categoria AHORROS → false (no cuenta como gasto del mes)', () => {
      expect(isGasto('COMPRA', 'AHORROS')).toBe(false)
    })

    it('COMPRA con categoria PRESTAMO → false (movimiento propio, no gasto)', () => {
      expect(isGasto('COMPRA', 'PRESTAMO')).toBe(false)
    })

    it('PAGO_SERVICIO con categoria AHORROS → false', () => {
      expect(isGasto('PAGO_SERVICIO', 'AHORROS')).toBe(false)
    })

    it('RETIRO con categoria PRESTAMO → false', () => {
      expect(isGasto('RETIRO', 'PRESTAMO')).toBe(false)
    })

    it('COMPRA con categoria HOGAR → true (categoria normal no anula el tipo)', () => {
      expect(isGasto('COMPRA', 'HOGAR')).toBe(true)
    })

    it('COMPRA con categoria SALIDAS → true', () => {
      expect(isGasto('COMPRA', 'SALIDAS')).toBe(true)
    })

    it('INGRESO con categoria AHORROS → false (tipo ya lo excluye)', () => {
      expect(isGasto('INGRESO', 'AHORROS')).toBe(false)
    })

    it('sin categoria (undefined) mantiene retrocompatibilidad', () => {
      expect(isGasto('COMPRA', undefined)).toBe(true)
      expect(isGasto('INGRESO', undefined)).toBe(false)
    })
  })
})

describe('formatCOPCompact', () => {
  it('millones con una cifra decimal', () => {
    expect(formatCOPCompact(1_500_000)).toBe('$1.5M')
  })

  it('millones exactos sin decimal', () => {
    expect(formatCOPCompact(2_000_000)).toBe('$2M')
  })

  it('miles', () => {
    expect(formatCOPCompact(50_000)).toBe('$50K')
  })

  it('monto pequeño sin sufijo', () => {
    expect(formatCOPCompact(800)).toBe('$800')
  })

  it('negativo en millones', () => {
    expect(formatCOPCompact(-1_200_000)).toBe('-$1.2M')
  })

  it('cero', () => {
    expect(formatCOPCompact(0)).toBe('$0')
  })
})
