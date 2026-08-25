import { describe, it, expect } from 'vitest'
import { deduplicateUber, matchUberAgainstPersisted } from '../../lib/utils/deduplicateUber'
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

  it('deduplicates pre-auth (same monto, within 15min) — removes the earlier one', () => {
    const preauth  = uberTx('preauth', '2026-06-07T10:00:00Z', 15000)
    const cobro    = uberTx('cobro',   '2026-06-07T10:05:00Z', 15000)
    const { transactions, preauthIds } = deduplicateUber([preauth, cobro])
    expect(transactions).toHaveLength(1)
    expect(transactions[0].id).toBe('cobro')
    expect(preauthIds).toContain('preauth')
  })

  it('deduplicates pre-auth even with a large monto difference (estimado vs. real)', () => {
    const preauth  = uberTx('preauth', '2026-06-07T09:00:00Z', 17667)
    const cobro    = uberTx('cobro',   '2026-06-07T09:00:29Z', 8725)  // 50% diff, 29s apart
    const { transactions, preauthIds } = deduplicateUber([preauth, cobro])
    expect(transactions).toHaveLength(1)
    expect(transactions[0].id).toBe('cobro')
    expect(preauthIds).toContain('preauth')
  })

  it('does NOT deduplicate trips more than 15min apart with very different montos (viajes distintos)', () => {
    const trip1 = uberTx('trip1', '2026-06-07T08:00:00Z', 12000)
    const trip2 = uberTx('trip2', '2026-06-07T08:30:00Z', 25000)  // 30min apart, monto muy distinto
    const { transactions, preauthIds } = deduplicateUber([trip1, trip2])
    expect(transactions).toHaveLength(2)
    expect(preauthIds).toHaveLength(0)
  })

  it('deduplicates a long ride (16-90min apart) when the monto is nearly identical', () => {
    // Viaje largo: el cobro final tarda más de 15min en llegar, pero el monto
    // ya casi no cambia respecto al pre-auth (a diferencia de un hold estimado)
    const preauth = uberTx('preauth', '2026-06-07T21:42:00Z', 13808)
    const cobro   = uberTx('cobro',   '2026-06-07T22:42:00Z', 13839)  // 60min, 31 COP de diferencia
    const { transactions, preauthIds } = deduplicateUber([preauth, cobro])
    expect(transactions).toHaveLength(1)
    expect(transactions[0].id).toBe('cobro')
    expect(preauthIds).toContain('preauth')
  })

  it('does NOT deduplicate beyond the 90min wide window even with identical montos', () => {
    const trip1 = uberTx('trip1', '2026-06-07T08:00:00Z', 12000)
    const trip2 = uberTx('trip2', '2026-06-07T09:41:00Z', 12000)  // 101min apart
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

describe('matchUberAgainstPersisted', () => {
  it('returns everything untouched when there is no persisted history', () => {
    const txs = [uberTx('a', '2026-06-07T10:00:00Z', 15000)]
    const { remaining, matches } = matchUberAgainstPersisted(txs, [])
    expect(remaining).toHaveLength(1)
    expect(matches).toHaveLength(0)
  })

  it('matches a final charge arriving in a later sync against a pre-auth already persisted', () => {
    // pre-auth ya se sincronizó (y quedó guardada) en un sync anterior
    const persisted = [{ id: 'db-row-1', fecha: '2026-06-07T10:00:00Z', monto: 17667 }]
    // el cobro final llega ahora, en un sync distinto
    const cobroFinal = uberTx('cobro-final', '2026-06-07T10:05:00Z', 8725)

    const { remaining, matches } = matchUberAgainstPersisted([cobroFinal], persisted)

    expect(remaining).toHaveLength(0) // no debe insertarse una fila nueva
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      newTxId: 'cobro-final',
      persistedId: 'db-row-1',
      updatePersisted: true, // la fila persistida se actualiza con el monto/fecha real
    })
  })

  it('drops a late/out-of-order pre-auth arriving after the final charge was already persisted', () => {
    // el cobro final ya quedó guardado (llegó primero, p. ej. por orden de bandeja)
    const persisted = [{ id: 'db-row-1', fecha: '2026-06-07T10:05:00Z', monto: 8725 }]
    // la pre-auth llega tarde, en un sync posterior
    const preauthTardia = uberTx('preauth-tardia', '2026-06-07T10:00:00Z', 17667)

    const { remaining, matches } = matchUberAgainstPersisted([preauthTardia], persisted)

    expect(remaining).toHaveLength(0)
    expect(matches).toHaveLength(1)
    expect(matches[0].updatePersisted).toBe(false) // no se toca la fila ya persistida
  })

  it('does not match persisted Uber rows more than 15min apart with different montos', () => {
    const persisted = [{ id: 'db-row-1', fecha: '2026-06-07T08:00:00Z', monto: 12000 }]
    const otroViaje = uberTx('otro-viaje', '2026-06-07T09:00:00Z', 30000)

    const { remaining, matches } = matchUberAgainstPersisted([otroViaje], persisted)

    expect(remaining).toHaveLength(1) // es un viaje distinto, se inserta normalmente
    expect(matches).toHaveLength(0)
  })

  it('matches a long-ride final charge (16-90min later) against a persisted pre-auth with near-identical monto', () => {
    const persisted = [{ id: 'db-row-1', fecha: '2026-06-07T21:42:00Z', monto: 13808 }]
    const cobroFinal = uberTx('cobro-final', '2026-06-07T22:42:00Z', 13839) // 60min, 31 COP diff

    const { remaining, matches } = matchUberAgainstPersisted([cobroFinal], persisted)

    expect(remaining).toHaveLength(0)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ persistedId: 'db-row-1', updatePersisted: true })
  })

  it('does not match beyond the 90min wide window even with identical montos', () => {
    const persisted = [{ id: 'db-row-1', fecha: '2026-06-07T08:00:00Z', monto: 12000 }]
    const otroViaje = uberTx('otro-viaje', '2026-06-07T09:41:00Z', 12000) // 101min

    const { remaining, matches } = matchUberAgainstPersisted([otroViaje], persisted)

    expect(remaining).toHaveLength(1)
    expect(matches).toHaveLength(0)
  })

  it('leaves non-Uber transactions untouched even with persisted Uber history', () => {
    const persisted = [{ id: 'db-row-1', fecha: '2026-06-07T10:00:00Z', monto: 17667 }]
    const txs = [otherTx('x')]

    const { remaining, matches } = matchUberAgainstPersisted(txs, persisted)

    expect(remaining).toHaveLength(1)
    expect(matches).toHaveLength(0)
  })

  it('does not double-match the same persisted row against two new transactions', () => {
    const persisted = [{ id: 'db-row-1', fecha: '2026-06-07T10:00:00Z', monto: 17667 }]
    const a = uberTx('a', '2026-06-07T10:01:00Z', 8000)
    const b = uberTx('b', '2026-06-07T10:02:00Z', 9000)

    const { remaining, matches } = matchUberAgainstPersisted([a, b], persisted)

    expect(matches).toHaveLength(1) // solo uno puede reclamar la fila persistida
    expect(remaining).toHaveLength(1) // el otro se inserta como transacción independiente
  })
})
