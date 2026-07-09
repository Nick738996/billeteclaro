import type { ExtractedTransaction } from '@/lib/types'

type TxItem = { id: string; extracted: ExtractedTransaction }

// Uber hace un hold (pre-autorización) al pedir el viaje y el cargo real llega
// al finalizarlo — el monto puede variar bastante (tarifa estimada vs. real),
// pero ambas notificaciones del banco llegan casi al mismo tiempo. Por eso el
// monto no es una señal confiable: solo la cercanía en el tiempo lo es.
const VENTANA_MINUTOS = 15

export function deduplicateUber(txs: TxItem[]): {
  transactions: TxItem[]
  preauthIds: string[]
} {
  const uberTxs = txs.filter(t => t.extracted.comercio?.toLowerCase().includes('uber'))
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
