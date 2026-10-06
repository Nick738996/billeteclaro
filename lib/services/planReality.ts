import type { BudgetSubcat, Capa, Transaction } from '@/lib/types'
import { esFijoDeHecho, esImprevisto, gruposRecurrentes, naturaleza } from '@/lib/services/monthSummary'

// ── Tu realidad de los últimos meses, para armar un plan que se cumpla ──────
//
// El plan se llenaba de memoria y siempre quedaba bajo: ponías $2,2 millones
// para el día a día y gastabas ~$3,3 millones, más un gasto grande cada mes
// (vuelo, bici) que no estaba en ningún lado. Esto calcula, con los meses
// anteriores, cuánto se va de verdad en cada parte del plan.

export interface MesReal {
  mes: string
  recibido: number
  /** Fijos + pagos que se repiten cada mes aunque estén categorizados como variables */
  fijos: number
  diaADia: number
  imprevistos: number
  ahorroNeto: number
}

export interface Historial {
  meses: MesReal[]
  /** Un mes normal: la mediana de cada parte. Con 3 meses, un vuelo de $4
   * millones no triplica los imprevistos como lo haría el promedio. */
  mesNormal: Omit<MesReal, 'mes'>
  /** Los imprevistos de esos meses, de mayor a menor */
  imprevistosTxs: Transaction[]
  /** Día a día promedio por categoría, de mayor a menor: dónde recortar */
  diaADiaPorCategoria: { categoria: string; monto: number }[]
}

export function historialPlan(
  txsAnteriores: Transaction[],
  capaOverrides: Record<string, Capa>,
  /** Ítems de fijos del plan actual: lo que se llame así cuenta como fijo también en meses anteriores */
  itemsFijos: BudgetSubcat[] = []
): Historial | null {
  const recurrentes = new Set(gruposRecurrentes(txsAnteriores, capaOverrides).keys())
  const porMes = new Map<string, MesReal>()
  const imprevistosTxs: Transaction[] = []
  const diaPorCat = new Map<string, number>()

  for (const t of txsAnteriores) {
    if (!t.mes_contable) continue
    const m = porMes.get(t.mes_contable) ?? { mes: t.mes_contable, recibido: 0, fijos: 0, diaADia: 0, imprevistos: 0, ahorroNeto: 0 }
    const monto = Number(t.monto)
    const n = naturaleza(t, capaOverrides)
    if (n === 'INGRESO') m.recibido += monto
    else if (n === 'AHORRO_APORTE') m.ahorroNeto += monto
    else if (n === 'AHORRO_RETIRO') m.ahorroNeto -= monto
    else if (n === 'GASTO_FIJO' || (n === 'GASTO_VARIABLE' && esFijoDeHecho(t, itemsFijos, recurrentes))) m.fijos += monto
    else if (n === 'GASTO_VARIABLE' && esImprevisto(t, recurrentes)) { m.imprevistos += monto; imprevistosTxs.push(t) }
    else if (n === 'GASTO_VARIABLE') { m.diaADia += monto; diaPorCat.set(t.categoria, (diaPorCat.get(t.categoria) ?? 0) + monto) }
    porMes.set(t.mes_contable, m)
  }

  // Solo meses con gasto registrado: un mes sin datos no es un mes barato
  const meses = [...porMes.values()].filter(m => m.fijos + m.diaADia + m.imprevistos > 0).sort((a, b) => a.mes.localeCompare(b.mes))
  if (meses.length === 0) return null
  const mediana = (f: (m: MesReal) => number) => {
    const v = meses.map(f).sort((a, b) => a - b)
    const mid = Math.floor(v.length / 2)
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
  }
  return {
    meses,
    mesNormal: {
      recibido: mediana(m => m.recibido),
      fijos: mediana(m => m.fijos),
      diaADia: mediana(m => m.diaADia),
      imprevistos: mediana(m => m.imprevistos),
      ahorroNeto: mediana(m => m.ahorroNeto),
    },
    imprevistosTxs: imprevistosTxs.sort((a, b) => b.monto - a.monto),
    diaADiaPorCategoria: [...diaPorCat.entries()]
      .map(([categoria, total]) => ({ categoria, monto: total / meses.length }))
      .sort((a, b) => b.monto - a.monto),
  }
}

/**
 * Págate primero: el día a día es lo que queda después de apartar el ahorro,
 * pagar los fijos y reservar para imprevistos. Negativo = el plan no cabe en
 * lo que te entra. Es la misma cuenta del presupuesto semanal del dashboard
 * (computeMonthSummary).
 */
export function diaADiaDelPlan(p: { ingreso: number; ahorro: number; fijos: number; imprevistos: number }): number {
  return p.ingreso - p.ahorro - p.fijos - p.imprevistos
}
