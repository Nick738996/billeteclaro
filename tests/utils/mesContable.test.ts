import { describe, it, expect } from 'vitest'
import { asignarMesContable } from '../../lib/utils/mesContable'

type TxInput = {
  id: string
  fecha: string
  monto: number
  tipo: string
  comercio?: string
  descripcion?: string
}

const tx = (id: string, fecha: string, monto: number, tipo: string, comercio?: string): TxInput => ({
  id, fecha, monto, tipo, comercio,
})

describe('asignarMesContable', () => {
  describe('con sueldo Citibank (mayo 2026)', () => {
    // Scenario verificado manualmente: sueldo el 28 de mayo a las 09:40
    const txs: TxInput[] = [
      tx('a', '2026-05-27T14:00:00Z', 50000,     'COMPRA',   'Rappi'),
      tx('b', '2026-05-28T09:40:00Z', 10254616,  'INGRESO',  'Banco Citibank Colombia'),  // sueldo
      tx('c', '2026-05-28T11:45:00Z', 25000,     'COMPRA',   'Rappi'),
      tx('d', '2026-05-31T09:00:00Z', 80000,     'COMPRA',   'Exito'),
    ]

    it('transacción antes del sueldo → 2026-05', () => {
      const result = asignarMesContable(txs)
      const a = result.find(r => (r as TxInput).id === 'a')!
      expect(a.mes_contable).toBe('2026-05')
      expect(a.es_sueldo).toBeUndefined()
    })

    it('transacción del sueldo → 2026-06 y es_sueldo: true', () => {
      const result = asignarMesContable(txs)
      const b = result.find(r => (r as TxInput).id === 'b')!
      expect(b.mes_contable).toBe('2026-06')
      expect(b.es_sueldo).toBe(true)
    })

    it('transacción posterior al sueldo (mismo día) → 2026-06', () => {
      const result = asignarMesContable(txs)
      const c = result.find(r => (r as TxInput).id === 'c')!
      expect(c.mes_contable).toBe('2026-06')
      expect(c.es_sueldo).toBeUndefined()
    })

    it('transacción anterior al sueldo pero mismo día COL → 2026-06 (todo el día va al siguiente)', () => {
      // Caso real: gasto a las 08:00 COL, sueldo a las 14:00 COL — ambos van al mes siguiente
      const txsConAnterior: TxInput[] = [
        tx('a2', '2026-05-28T13:00:00Z', 30000,    'COMPRA',  'Rappi'),       // 08:00 COL mismo día
        tx('b2', '2026-05-28T20:00:00Z', 10254616, 'INGRESO', 'Banco Citibank Colombia'), // 15:00 COL sueldo
      ]
      const result = asignarMesContable(txsConAnterior)
      expect(result.find(r => (r as TxInput).id === 'a2')!.mes_contable).toBe('2026-06')
      expect(result.find(r => (r as TxInput).id === 'b2')!.mes_contable).toBe('2026-06')
    })

    it('transacción a las 23:41 COL del día anterior no se pasa (UTC edge case)', () => {
      // 23:41 hora Colombia = 04:41 UTC del día siguiente.
      // Sin la corrección de timezone, slice(0,10) daría el mismo día que el sueldo
      // y la transacción se pasaría incorrectamente al mes siguiente.
      const txsTimezone: TxInput[] = [
        tx('z1', '2026-05-28T04:41:00Z', 200000,   'COMPRA',  'Andres Carne de Res'), // 23:41 COL día 27
        tx('z2', '2026-05-28T20:13:00Z', 10254616, 'INGRESO', 'Banco Citibank Colombia'), // 15:13 COL día 28
      ]
      const result = asignarMesContable(txsTimezone)
      expect(result.find(r => (r as TxInput).id === 'z1')!.mes_contable).toBe('2026-05') // queda en mayo
      expect(result.find(r => (r as TxInput).id === 'z2')!.mes_contable).toBe('2026-06') // va a junio
    })

    it('transacción al final del mes → 2026-06', () => {
      const result = asignarMesContable(txs)
      const d = result.find(r => (r as TxInput).id === 'd')!
      expect(d.mes_contable).toBe('2026-06')
    })
  })

  describe('sin sueldo detectado (fallback últimos 3 días)', () => {
    // Abril 2026 tiene 30 días → fallback desde día 28
    const txs: TxInput[] = [
      tx('e', '2026-04-15T10:00:00Z', 30000, 'COMPRA', 'Netflix'),
      tx('f', '2026-04-27T10:00:00Z', 15000, 'COMPRA', 'Uber'),
      tx('g', '2026-04-28T10:00:00Z', 50000, 'COMPRA', 'Exito'),
      tx('h', '2026-04-30T10:00:00Z', 20000, 'COMPRA', 'Juan Valdez'),
    ]

    it('transacción a mitad del mes → 2026-04', () => {
      const result = asignarMesContable(txs)
      const e = result.find(r => (r as TxInput).id === 'e')!
      expect(e.mes_contable).toBe('2026-04')
    })

    it('transacción día 27 (antes del fallback) → 2026-04', () => {
      const result = asignarMesContable(txs)
      const f = result.find(r => (r as TxInput).id === 'f')!
      expect(f.mes_contable).toBe('2026-04')
    })

    it('transacción día 28 (inicio fallback) → 2026-05', () => {
      const result = asignarMesContable(txs)
      const g = result.find(r => (r as TxInput).id === 'g')!
      expect(g.mes_contable).toBe('2026-05')
    })

    it('último día → 2026-05', () => {
      const result = asignarMesContable(txs)
      const h = result.find(r => (r as TxInput).id === 'h')!
      expect(h.mes_contable).toBe('2026-05')
    })
  })

  describe('mes contable cruza diciembre → enero', () => {
    const txs: TxInput[] = [
      tx('i', '2026-12-01T10:00:00Z', 20000, 'COMPRA', 'Netflix'),
      tx('j', '2026-12-30T09:00:00Z', 9500000, 'INGRESO', 'Banco Citibank Colombia'), // sueldo
      tx('k', '2026-12-30T14:00:00Z', 30000, 'COMPRA', 'Uber'),
    ]

    it('sueldo en diciembre mueve transacciones posteriores a 2027-01', () => {
      const result = asignarMesContable(txs)
      const j = result.find(r => (r as TxInput).id === 'j')!
      const k = result.find(r => (r as TxInput).id === 'k')!
      expect(j.mes_contable).toBe('2027-01')
      expect(k.mes_contable).toBe('2027-01')
    })

    it('transacción antes del sueldo permanece en 2026-12', () => {
      const result = asignarMesContable(txs)
      const i = result.find(r => (r as TxInput).id === 'i')!
      expect(i.mes_contable).toBe('2026-12')
    })
  })

  it('retorna array vacío para entrada vacía', () => {
    expect(asignarMesContable([])).toEqual([])
  })
})
