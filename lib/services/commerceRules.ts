import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transaction } from '@/lib/types'
import {
  isIngreso,
  SUBCATEGORIA_APORTE_AHORROS,
  SUBCATEGORIA_RETIRO_AHORROS,
} from '@/lib/types'

// ── Reglas por comercio ─────────────────────────────────────────────────────
//
// Cuando el usuario cambia la categoría de un movimiento, la app la recuerda
// para ese comercio (o esa cuenta destino, en transferencias) y la usa en los
// correos que lleguen después. Antes había que corregir el mismo comercio una
// y otra vez: Combo Padel Club llegó a estar en Otro, Salidas y Deportes.

// Palabras que los bancos le pegan al nombre del comercio y no lo identifican
const RUIDO = new Set([
  'trip', 'rides', 'sas', 's', 'a', 'sa', 'ltda', 'co', 'col', 'colombia', 'bogota', 'bog', 'dc', 'www', 'com',
])

/** "Uber Trip" → "uber", "Oxxo Contador Bogota Co" → "oxxo contador" */
export function normalizeComercio(comercio: string | null | undefined): string {
  if (!comercio) return ''
  return comercio
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w && !RUIDO.has(w) && !/\d/.test(w))
    .join(' ')
}

type TxClave = Pick<Transaction, 'tipo' | 'comercio' | 'contraparte_id'> & { subcategoria?: string | null }

/**
 * Clave de la regla, o null si este movimiento no debe enseñar ni recibir reglas:
 * - entradas: "Bancolombia" puede ser tu sueldo, un préstamo que te pagaron o
 *   plata tuya; no se puede generalizar por nombre
 * - pagos de tarjeta y movimientos de tus bolsillos de ahorro: ya tienen su lugar
 * - transferencias sin cuenta destino: el nombre suele ser el que tú le pusiste
 */
export function ruleKey(tx: TxClave): string | null {
  if (isIngreso(tx.tipo) || tx.tipo === 'ABONO_DEUDA') return null
  if (tx.subcategoria === SUBCATEGORIA_APORTE_AHORROS || tx.subcategoria === SUBCATEGORIA_RETIRO_AHORROS) return null
  if (tx.tipo === 'TRANSFERENCIA_ENVIADA') {
    const cta = tx.contraparte_id?.trim().toLowerCase()
    return cta ? `cta:${cta}` : null
  }
  const com = normalizeComercio(tx.comercio)
  return com ? `com:${com}` : null
}

export async function getCommerceRules(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('commerce_rules')
    .select('clave, categoria')
    .eq('user_id', userId)
  if (error) throw new Error(`getCommerceRules: ${error.message}`)
  return new Map((data ?? []).map(r => [r.clave as string, r.categoria as string]))
}

/** Categoría recordada para este movimiento, si hay regla */
export function categoriaPorRegla(tx: TxClave, rules: Map<string, string>): string | null {
  const key = ruleKey(tx)
  return key ? rules.get(key) ?? null : null
}

/**
 * Aprende de un cambio de categoría hecho por el usuario: guarda la regla y
 * corrige los demás movimientos del mismo comercio en ese mes, para que la
 * pantalla quede consistente. No toca otros meses: un cambio deliberado en
 * un mes cerrado se respeta.
 * Retorna cuántos movimientos parecidos se actualizaron.
 */
export async function learnCategoryRule(
  supabase: SupabaseClient,
  userId: string,
  tx: Transaction
): Promise<number> {
  const key = ruleKey(tx)
  if (!key) return 0

  const { error } = await supabase
    .from('commerce_rules')
    .upsert(
      { user_id: userId, clave: key, categoria: tx.categoria, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,clave' }
    )
  if (error) throw new Error(`learnCategoryRule: ${error.message}`)

  if (!tx.mes_contable) return 0
  const { data: delMes, error: selError } = await supabase
    .from('transactions')
    .select('id, tipo, comercio, contraparte_id, subcategoria, categoria')
    .eq('user_id', userId)
    .eq('mes_contable', tx.mes_contable)
  if (selError) throw new Error(`learnCategoryRule (select): ${selError.message}`)

  const parecidos = (delMes ?? []).filter(t => t.id !== tx.id && t.categoria !== tx.categoria && ruleKey(t) === key)
  for (const t of parecidos) {
    const { error: upError } = await supabase
      .from('transactions')
      .update({ categoria: tx.categoria })
      .eq('id', t.id)
      .eq('user_id', userId)
    if (upError) throw new Error(`learnCategoryRule (update): ${upError.message}`)
  }
  return parecidos.length
}

/** Borra las reglas que apuntan a una categoría (al eliminarla) */
export async function deleteRulesForCategoria(
  supabase: SupabaseClient,
  userId: string,
  categoria: string
): Promise<void> {
  const { error } = await supabase
    .from('commerce_rules')
    .delete()
    .eq('user_id', userId)
    .eq('categoria', categoria)
  if (error) throw new Error(`deleteRulesForCategoria: ${error.message}`)
}
