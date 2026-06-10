import { describe, it, expect } from 'vitest'
import { deduplicateUber } from '../../lib/utils/deduplicateUber'
import type { ExtractedTransaction } from '../../lib/types'

const uberTx = (id: string, fecha: string, monto: number): { id: string; extracted: ExtractedTransaction } => ({
  id,
  extracted: {
    fecha,
    monto,
    comercio: 'Uber',
    descripcion: 'Compra en Uber',
    banco: 'RAPPICARD',
    tipo: 'COMPRA',
    categoria: 'TRANSPORTE',
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  },
})

const otherTx = (id: string): { id: string; extracted: ExtractedTransaction } => ({
  id,
  extracted: {
    fecha: '2026-06-07T10:00:00Z',
    monto: 50000,
    comercio: 'Juan Valdez',
    descripcion: null,
    banco: 'RAPPICARD',
    tipo: 'COMPRA',
    categoria: 'SALIDAS',
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  },
})

describe('deduplicateUber', () => {
  it('keeps all transactions when fewer than 2 Uber entries', () => {
    const txs = [uberTx('a', '2026-06-07T10:00:00Z', 15000), otherTx('b')]
    const { transactions, preauthIds } = deduplicateUber(txs)
    expect(transactions).toHaveLength(2)
    expect(preauthIds).toHaveLength(0)
  })

  it('deduplicates pre-auth (same monto, within 2h) — removes the earlier one', () => {
    const preauth  = uberTx('preauth', '2026-06-07T10:00:00Z', 15000)
    const cobro    = uberTx('cobro',   '2026-06-07T10:30:00Z', 15000)
    const { transactions, preauthIds } = deduplicateUber([preauth, cobro])
    expect(transactions).toHaveLength(1)
    expect(transactions[0].id).toBe('cobro')
    expect(preauthIds).toContain('preauth')
  })

  it('deduplicates pre-auth with slight monto difference (≤20%)', () => {
    const preauth  = uberTx('preauth', '2026-06-07T09:00:00Z', 10000)
    const cobro    = uberTx('cobro',   '2026-06-07T09:45:00Z', 11500)  // 15% diff
    const { transactions, preauthIds } = deduplicateUber([preauth, cobro])
    expect(transactions).toHaveLength(1)
    expect(preauthIds).toHaveLength(1)
  })

  it('does NOT deduplicate trips more than 2h apart', () => {
    const trip1 = uberTx('trip1', '2026-06-07T08:00:00Z', 12000)
    const trip2 = uberTx('trip2', '2026-06-07T12:00:00Z', 12000)  // 4h apart
    const { transactions, preauthIds } = deduplicateUber([trip1, trip2])
    expect(transactions).toHaveLength(2)
    expect(preauthIds).toHaveLength(0)
  })

  it('does NOT deduplicate trips with monto difference >20%', () => {
    const trip1 = uberTx('trip1', '2026-06-07T10:00:00Z', 10000)
    const trip2 = uberTx('trip2', '2026-06-07T10:30:00Z', 15000)  // 50% diff
    const { transactions, preauthIds } = deduplicateUber([trip1, trip2])
    expect(transactions).toHaveLength(2)
    expect(preauthIds).toHaveLength(0)
  })

  it('leaves non-Uber transactions untouched', () => {
    const txs = [otherTx('x'), otherTx('y'), otherTx('z')]
    const { transactions, preauthIds } = deduplicateUber(txs)
    expect(transactions).toHaveLength(3)
    expect(preauthIds).toHaveLength(0)
  })

  it('handles empty array', () => {
    const { transactions, preauthIds } = deduplicateUber([])
    expect(transactions).toHaveLength(0)
    expect(preauthIds).toHaveLength(0)
  })
})
