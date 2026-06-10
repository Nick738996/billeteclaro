import type { ExtractedTransaction } from '@/lib/types'

type TxItem = { id: string; extracted: ExtractedTransaction }

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
      if (Math.abs(timeA - timeB) / 3_600_000 <= 2) {
        const pctDiff = Math.abs(uberTxs[i].extracted.monto - uberTxs[j].extracted.monto) /
          Math.max(uberTxs[i].extracted.monto, uberTxs[j].extracted.monto)
        if (pctDiff <= 0.2) {
          preauthIds.add(timeA <= timeB ? uberTxs[i].id : uberTxs[j].id)
        }
      }
    }
  }
  return { transactions: txs.filter(t => !preauthIds.has(t.id)), preauthIds: [...preauthIds] }
}
