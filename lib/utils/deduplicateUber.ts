import type { ExtractedTransaction } from '@/lib/types'

type TxItem = { id: string; extracted: ExtractedTransaction }

// Uber hace un hold (pre-autorización) al pedir el viaje y el cargo real llega
// al finalizarlo — el monto puede variar bastante (tarifa estimada vs. real),
// pero ambas notificaciones del banco llegan casi al mismo tiempo. Por eso el
// monto no es una señal confiable: solo la cercanía en el tiempo lo es.
const VENTANA_MINUTOS = 15

const esUber = (comercio: string | null) => comercio?.toLowerCase().includes('uber') ?? false

export function deduplicateUber(txs: TxItem[]): {
  transactions: TxItem[]
  preauthIds: string[]
} {
  const uberTxs = txs.filter(t => esUber(t.extracted.comercio))
  if (uberTxs.length < 2) return { transactions: txs, preauthIds: [] }

  const preauthIds = new Set<string>()
  for (let i = 0; i < uberTxs.length; i++) {
    if (preauthIds.has(uberTxs[i].id)) continue
    for (let j = i + 1; j < uberTxs.length; j++) {
      if (preauthIds.has(uberTxs[j].id)) continue
      const timeA = new Date(uberTxs[i].extracted.fecha ?? '').getTime()
      const timeB = new Date(uberTxs[j].extracted.fecha ?? '').getTime()
      if (Math.abs(timeA - timeB) / 60_000 <= VENTANA_MINUTOS) {
        // Se queda solo la segunda transacción (el cargo real al finalizar el viaje)
        preauthIds.add(timeA <= timeB ? uberTxs[i].id : uberTxs[j].id)
      }
    }
  }
  return { transactions: txs.filter(t => !preauthIds.has(t.id)), preauthIds: [...preauthIds] }
}

/**
 * Fila de Uber ya persistida en `transactions`, candidata a emparejar contra
 * transacciones nuevas de la sync actual (dedup *entre* syncs distintos).
 */
export interface PersistedUberCandidate {
  id: string // uuid de la fila en `transactions`
  fecha: string
  monto: number
}

export interface CrossSyncUberMatch {
  /** id (gmail/outlook message id) de la transacción nueva que no debe insertarse */
  newTxId: string
  /** uuid de la fila ya persistida involucrada en el match */
  persistedId: string
  /**
   * true  → la transacción nueva es el cobro final llegando en un sync posterior:
   *         hay que actualizar la fila persistida con su monto/fecha y NO insertar
   *         una fila nueva.
   * false → la transacción nueva es una pre-autorización que llegó tarde/desordenada
   *         respecto a un cobro final que ya está persistido: se descarta sin tocar
   *         la fila existente.
   */
  updatePersisted: boolean
}

/**
 * Empareja transacciones de Uber recién parseadas contra filas de Uber ya
 * guardadas en la base de datos.
 *
 * `deduplicateUber()` solo compara transacciones dentro del mismo lote de un
 * sync — si la pre-autorización se sincronizó ayer y el cobro final llega hoy
 * en un sync distinto, nunca se ven juntas y el cobro final se inserta como
 * un gasto duplicado. Esta función cierra ese hueco comparando también contra
 * el historial ya persistido.
 */
export function matchUberAgainstPersisted(
  newTxs: TxItem[],
  persisted: PersistedUberCandidate[]
): { remaining: TxItem[]; matches: CrossSyncUberMatch[] } {
  if (persisted.length === 0) return { remaining: newTxs, matches: [] }

  const consumedPersisted = new Set<string>()
  const matchedNewIds = new Set<string>()
  const matches: CrossSyncUberMatch[] = []

  for (const tx of newTxs) {
    if (!esUber(tx.extracted.comercio)) continue
    const txTime = new Date(tx.extracted.fecha ?? '').getTime()
    if (Number.isNaN(txTime)) continue

    let best: PersistedUberCandidate | null = null
    let bestDiff = Infinity
    for (const p of persisted) {
      if (consumedPersisted.has(p.id)) continue
      const diffMin = Math.abs(txTime - new Date(p.fecha).getTime()) / 60_000
      if (diffMin <= VENTANA_MINUTOS && diffMin < bestDiff) {
        best = p
        bestDiff = diffMin
      }
    }
    if (!best) continue

    consumedPersisted.add(best.id)
    matchedNewIds.add(tx.id)
    matches.push({
      newTxId: tx.id,
      persistedId: best.id,
      // Si la nueva transacción llegó igual o después que la ya persistida,
      // es el cobro final apareciendo en un sync posterior → actualizamos la
      // fila. Si llegó antes, es una pre-autorización fuera de orden → se
      // descarta y la fila ya persistida (el cobro final) queda intacta.
      updatePersisted: txTime >= new Date(best.fecha).getTime(),
    })
  }

  return { remaining: newTxs.filter(t => !matchedNewIds.has(t.id)), matches }
}
