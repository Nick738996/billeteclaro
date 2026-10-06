import { describe, it, expect } from 'vitest'
import { agruparRepetidos } from '@/lib/utils/agruparRepetidos'
import type { Transaction } from '@/lib/types'

function tx(id: string, overrides: Partial<Transaction>): Transaction {
  return {
    id, user_id: 'u1', gmail_message_id: id, fecha: '2026-10-02T15:00:00Z', monto: 10_000,
    comercio: 'Comercio', descripcion: null, banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'OTRO',
    subcategoria: null, id_auditoria: null, moneda: 'COP', monto_usd: null, flags: [], raw_snippet: null,
    procesado: true, mes_contable: '2026-10', es_sueldo: false, created_at: '', contraparte_id: null, capa_override: null,
    ...overrides,
  }
}

describe('agruparRepetidos (2 de octubre)', () => {
  const dia = [
    tx('u1', { comercio: 'Uber Trip', monto: 47_124 }),
    tx('arr', { tipo: 'TRANSFERENCIA_ENVIADA', comercio: 'Bicicleta Java', contraparte_id: '@x', monto: 2_690_000 }),
    tx('u2', { comercio: 'Uber Trip', monto: 31_875 }),
    tx('pad', { comercio: 'Combo Padel Club', monto: 56_500 }),
    tx('u3', { comercio: 'Uber', monto: 12_235 }),
  ]

  it('junta los Ubers del día en un bloque donde estaba el primero', () => {
    const b = agruparRepetidos(dia)
    expect(b.map(x => x.tipo === 'grupo' ? `grupo:${x.txs.length}` : x.t.id)).toEqual(['grupo:3', 'arr', 'pad'])
    const g = b[0]
    expect(g.tipo === 'grupo' && g.total).toBe(47_124 + 31_875 + 12_235)
  })

  it('no agrupa transferencias ni comercios que aparecen una sola vez', () => {
    const b = agruparRepetidos([
      tx('t1', { tipo: 'TRANSFERENCIA_ENVIADA', comercio: 'Mamá', contraparte_id: '300' }),
      tx('t2', { tipo: 'TRANSFERENCIA_ENVIADA', comercio: 'Mamá', contraparte_id: '300' }),
      tx('c1', { comercio: 'Juan Valdez' }),
    ])
    expect(b.every(x => x.tipo === 'tx')).toBe(true)
  })
})
