import type { BudgetSubcat, Capa } from '@/lib/types'
import { CATEGORIA_CAPA_DEFAULT, CATEGORIA_LABELS, type Categoria } from '@/lib/types'

// ── Ítems del plan como categorías ──────────────────────────────────────────
//
// Lo que el usuario escribe en el desglose de su plan (Arriendo, Gym,
// Mercado…) es justo como piensa en su plata. Cada ítem se vuelve una
// categoría elegible al clasificar un movimiento, con la capa de la sección
// donde lo puso: desglose de Fijos → Fijo, desglose de Ahorro → Ahorro.

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Clave de categoría para un ítem del plan: reusa la predeterminada si coincide ("Inversión" → INVERSION) */
export function categoriaDeItem(nombre: string): string {
  const key = sinTildes(nombre.trim()).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (key in CATEGORIA_LABELS) return key
  const porLabel = (Object.keys(CATEGORIA_LABELS) as Categoria[])
    .find(c => sinTildes(CATEGORIA_LABELS[c]).toUpperCase() === sinTildes(nombre.trim()).toUpperCase())
  return porLabel ?? key
}

export interface CategoriaDelPlan {
  categoria: string
  /** Nombre tal como lo escribió el usuario en el plan */
  nombre: string
  capa: Capa
}

export function categoriasDelPlan(plan: { fijoItems?: BudgetSubcat[]; ahorroItems?: BudgetSubcat[] } | null): CategoriaDelPlan[] {
  if (!plan) return []
  const out = new Map<string, CategoriaDelPlan>()
  const add = (items: BudgetSubcat[] | undefined, capa: Capa) => {
    for (const it of items ?? []) {
      if (!it.nombre?.trim()) continue
      const categoria = categoriaDeItem(it.nombre)
      if (categoria && !out.has(categoria)) out.set(categoria, { categoria, nombre: it.nombre.trim(), capa })
    }
  }
  add(plan.fijoItems, 'FIJO')
  add(plan.ahorroItems, 'AHORRO')
  return [...out.values()]
}

/**
 * Categorías del plan que todavía no tienen capa guardada. Solo las nuevas
 * (custom): una predeterminada como Suscripciones ya tiene su capa, y una que
 * el usuario ya reclasificó a mano en "Categorías" se respeta.
 */
export function categoriasPorRegistrar(
  delPlan: CategoriaDelPlan[],
  capaOverrides: Record<string, Capa>
): CategoriaDelPlan[] {
  return delPlan.filter(c => !(c.categoria in CATEGORIA_LABELS) && !(c.categoria in capaOverrides))
}

/**
 * Capa de cada categoría según el plan del mes: los ítems del desglose de
 * Fijos son FIJO y los del desglose de Ahorro son AHORRO. Es el mapa que usa
 * toda la app para decidir qué es fijo (ver CATEGORIA_CAPA_DEFAULT: ninguna
 * categoría predeterminada es fija por sí sola).
 */
export function capasDelPlan(plan: { fijoItems?: BudgetSubcat[]; ahorroItems?: BudgetSubcat[] } | null): Record<string, Capa> {
  const out: Record<string, Capa> = {}
  for (const c of categoriasDelPlan(plan)) {
    // Un ítem "Inversión" dentro de Fijos no vuelve gasto tus aportes: las
    // categorías de ahorro (y las que no cuentan, como Préstamo) no se tocan.
    // La lista para chulear igual lo empareja con el aporte.
    if (c.categoria in CATEGORIA_CAPA_DEFAULT && CATEGORIA_CAPA_DEFAULT[c.categoria as Categoria] !== 'VARIABLE') continue
    out[c.categoria] = c.capa
  }
  return out
}
