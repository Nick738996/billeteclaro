import type { Transaction } from '@/lib/types'
import { ruleKey } from '@/lib/services/commerceRules'

export type BloqueLista =
  | { tipo: 'tx'; t: Transaction }
  | { tipo: 'grupo'; key: string; txs: Transaction[]; total: number }

/**
 * Junta en un solo bloque las compras del mismo comercio dentro de una lista
 * (normalmente un día): 3 Ubers el mismo día son un renglón, no tres. Solo
 * compras por comercio (clave 'com:'); transferencias y entradas se muestran
 * siempre solas. El bloque queda donde estaba la primera de sus compras.
 */
export function agruparRepetidos(items: Transaction[]): BloqueLista[] {
  const porClave = new Map<string, Transaction[]>()
  for (const t of items) {
    const key = ruleKey(t)
    if (key?.startsWith('com:')) porClave.set(key, [...(porClave.get(key) ?? []), t])
  }

  const out: BloqueLista[] = []
  const emitidos = new Set<string>()
  for (const t of items) {
    const key = ruleKey(t)
    const grupo = key ? porClave.get(key) : undefined
    if (key && grupo && grupo.length >= 2) {
      if (emitidos.has(key)) continue
      emitidos.add(key)
      out.push({ tipo: 'grupo', key, txs: grupo, total: grupo.reduce((s, x) => s + Number(x.monto), 0) })
    } else {
      out.push({ tipo: 'tx', t })
    }
  }
  return out
}
