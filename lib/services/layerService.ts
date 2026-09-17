import type { SupabaseClient } from '@supabase/supabase-js'
import type { Categoria, Transaction, Capa } from '@/lib/types'
import { CATEGORIA_CAPA_DEFAULT, isGasto } from '@/lib/types'

export async function getCustomCapaOverrides(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, Capa>> {
  const { data, error } = await supabase
    .from('category_capas')
    .select('categoria, capa')
    .eq('user_id', userId)

  if (error) throw new Error(`getCustomCapaOverrides: ${error.message}`)

  const map: Record<string, Capa> = {}
  for (const row of data ?? []) map[row.categoria] = row.capa as Capa
  return map
}

export async function saveCategoryCapa(
  supabase: SupabaseClient,
  userId: string,
  categoria: string,
  capa: Capa
): Promise<void> {
  const { error } = await supabase
    .from('category_capas')
    .upsert({ user_id: userId, categoria, capa }, { onConflict: 'user_id,categoria' })
  if (error) throw new Error(`saveCategoryCapa: ${error.message}`)
}

/**
 * Capa de una transacción: gana `capa_override` (toggle "Gasto Fijo" del
 * registro rápido, o reclasificación manual), luego el override de la
 * categoría en `category_capas` (custom o built-in reclasificada), luego el
 * default de CATEGORIA_CAPA_DEFAULT para las 16 categorías built-in.
 *
 * Una categoría custom (creada por el usuario, ej. "MASCOTAS") no está en
 * CATEGORIA_CAPA_DEFAULT — por defecto cae en VARIABLE, no en `null`. Solo
 * las 3 categorías explícitamente marcadas `null` ahí (REEMBOLSABLE,
 * TRANSFERENCIA, INGRESO) quedan fuera de las 3 capas.
 */
export function getCapaForTransaccion(
  tx: Pick<Transaction, 'categoria' | 'capa_override'>,
  capaOverrides: Record<string, Capa>
): Capa | null {
  if (tx.capa_override) return tx.capa_override
  const override = capaOverrides[tx.categoria]
  if (override) return override
  if (tx.categoria in CATEGORIA_CAPA_DEFAULT) return CATEGORIA_CAPA_DEFAULT[tx.categoria as Categoria]
  return 'VARIABLE'
}

/**
 * true si `categoria` pertenece al bloque de Gastos Fijos que BudgetManager
 * deja presupuestar (categorías built-in con capa FIJO, o cualquier
 * categoría custom — en BudgetManager solo se crean customs desde la
 * sección Fijo, así que una custom sin CATEGORIA_CAPA_DEFAULT se asume Fijo
 * ahí; getCapaForTransaccion, en cambio, asume VARIABLE por defecto porque
 * ese es el comportamiento correcto para un gasto sin clasificar).
 */
export function isFijoBudgetCategory(categoria: string): boolean {
  if (categoria in CATEGORIA_CAPA_DEFAULT) return CATEGORIA_CAPA_DEFAULT[categoria as Categoria] === 'FIJO'
  return true
}

export interface LayerTotals {
  ahorro: number
  fijo: number
  variable: number
}

/**
 * Ahorro cuenta como "apartado" (isGasto ya excluye AHORROS/PRESTAMO del
 * gasto tradicional, pero para la Capa 1 sí queremos sumar ese dinero).
 * Fijo y Variable solo suman transacciones que son gasto real (isGasto),
 * así una transferencia recibida o un reembolso no infla esas capas.
 */
export function computeLayerTotals(
  txs: Transaction[],
  capaOverrides: Record<string, Capa>
): LayerTotals {
  const totals: LayerTotals = { ahorro: 0, fijo: 0, variable: 0 }

  for (const tx of txs) {
    const capa = getCapaForTransaccion(tx, capaOverrides)
    if (!capa) continue

    if (capa === 'AHORRO') {
      totals.ahorro += Number(tx.monto)
    } else if (isGasto(tx.tipo, tx.categoria)) {
      totals[capa === 'FIJO' ? 'fijo' : 'variable'] += Number(tx.monto)
    }
  }

  return totals
}
