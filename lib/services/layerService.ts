import type { SupabaseClient } from '@supabase/supabase-js'
import type { Categoria, Transaction, Capa } from '@/lib/types'
import { CATEGORIA_CAPA_DEFAULT, CATEGORIA_LABELS, SUBCATEGORIA_RETIRO_AHORROS, isGasto, isIngreso } from '@/lib/types'

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

/** true si la categoría viene con la app (no la creó el usuario) */
export function isBuiltInCategoria(categoria: string): categoria is Categoria {
  return categoria in CATEGORIA_LABELS
}

/**
 * Restaura la capa por defecto de una categoría built-in (borra su override).
 */
export async function resetCategoryCapa(
  supabase: SupabaseClient,
  userId: string,
  categoria: string
): Promise<void> {
  const { error } = await supabase
    .from('category_capas')
    .delete()
    .eq('user_id', userId)
    .eq('categoria', categoria)
  if (error) throw new Error(`resetCategoryCapa: ${error.message}`)
}

/**
 * Elimina una categoría creada por el usuario: sus transacciones pasan a OTRO
 * (no se pierde ningún movimiento) y se borran su capa y sus presupuestos.
 * Una categoría built-in no se puede eliminar, los parsers la asignan solos.
 * Retorna cuántas transacciones se movieron a OTRO.
 */
export async function deleteCustomCategory(
  supabase: SupabaseClient,
  userId: string,
  categoria: string
): Promise<number> {
  if (isBuiltInCategoria(categoria)) {
    throw new Error('deleteCustomCategory: no se puede eliminar una categoría predeterminada')
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({ categoria: 'OTRO' })
    .eq('user_id', userId)
    .eq('categoria', categoria)
    .select('id')
  if (error) throw new Error(`deleteCustomCategory (transactions): ${error.message}`)

  const { error: budgetsError } = await supabase
    .from('budgets')
    .delete()
    .eq('user_id', userId)
    .eq('categoria', categoria)
  if (budgetsError) throw new Error(`deleteCustomCategory (budgets): ${budgetsError.message}`)

  await resetCategoryCapa(supabase, userId, categoria)
  return data?.length ?? 0
}

/**
 * Categorías creadas por el usuario: las que tienen capa guardada más
 * cualquier no built-in que aparezca en sus transacciones.
 */
export function listCustomCategories(
  capaOverrides: Record<string, Capa>,
  txs: Pick<Transaction, 'categoria'>[],
  extra: string[] = []
): string[] {
  const set = new Set<string>([...Object.keys(capaOverrides), ...extra])
  for (const t of txs) set.add(t.categoria)
  return [...set].filter(c => !isBuiltInCategoria(c)).sort()
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
 * TRANSFERENCIA, INGRESO, PRESTAMO) quedan fuera de las 3 capas.
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
 * Capa en la que una transacción SUMA para el plan del mes, o `null` si no
 * suma en ninguna. Es la única regla que usan los totales por capa, el cupo
 * semanal y el detalle de cada capa — así los tres números siempre cuadran.
 *
 * - Ahorro: dinero que sale hacia Ahorros/Inversión (isGasto lo excluye del
 *   gasto tradicional, pero para la Capa 1 sí cuenta). Una entrada (ej. un
 *   retiro de ahorros o rendimientos) nunca suma como ahorro.
 * - Fijo / Variable: solo gasto real (isGasto), así una transferencia
 *   recibida, un pago de tarjeta o un reembolso no inflan esas capas.
 */
export function countedCapa(
  tx: Pick<Transaction, 'categoria' | 'capa_override' | 'tipo'>,
  capaOverrides: Record<string, Capa>
): Capa | null {
  const capa = getCapaForTransaccion(tx, capaOverrides)
  if (!capa) return null
  if (capa === 'AHORRO') return isIngreso(tx.tipo) ? null : 'AHORRO'
  return isGasto(tx.tipo, tx.categoria) ? capa : null
}

export interface LayerTotals {
  ahorro: number
  fijo: number
  variable: number
}

export function computeLayerTotals(
  txs: Transaction[],
  capaOverrides: Record<string, Capa>
): LayerTotals {
  const totals: LayerTotals = { ahorro: 0, fijo: 0, variable: 0 }
  for (const tx of txs) {
    const capa = countedCapa(tx, capaOverrides)
    if (capa) totals[capa === 'AHORRO' ? 'ahorro' : capa === 'FIJO' ? 'fijo' : 'variable'] += Number(tx.monto)
  }
  return totals
}

/**
 * Ingreso real del mes para el plan: todo lo que entró, MENOS los retiros de
 * tus propios ahorros. Sacar plata de un bolsillo no es ganarla, y contarla
 * inflaba el ingreso del plan y con él el cupo semanal (septiembre 2026:
 * $2.8M de retiros hicieron que cada día valiera más del doble).
 */
export function computeIngresoReal(
  txs: Pick<Transaction, 'tipo' | 'monto' | 'subcategoria'>[]
): number {
  return txs
    .filter(t => isIngreso(t.tipo) && t.subcategoria !== SUBCATEGORIA_RETIRO_AHORROS)
    .reduce((s, t) => s + Number(t.monto), 0)
}

/**
 * Salidas de plata del mes que no suman en ninguna capa: préstamos que diste
 * y transferencias a personas sin categorizar. Los pagos de tarjeta
 * (ABONO_DEUDA) no entran — las compras de la tarjeta ya se registraron una
 * por una, contarlos sería doble.
 */
export function isSalidaFueraDelPlan(
  tx: Pick<Transaction, 'categoria' | 'capa_override' | 'tipo'>,
  capaOverrides: Record<string, Capa>
): boolean {
  if (isIngreso(tx.tipo) || tx.tipo === 'ABONO_DEUDA') return false
  return countedCapa(tx, capaOverrides) === null
}
