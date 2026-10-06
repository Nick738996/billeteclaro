import type { BudgetSubcat, Capa, Transaction } from '@/lib/types'
import {
  SUBCATEGORIA_CONFIRMADO,
  SUBCATEGORIA_PAGADO_CON_AHORROS,
  SUBCATEGORIA_RETIRO_AHORROS,
  isIngreso,
} from '@/lib/types'
import { countedCapa } from '@/lib/services/layerService'
import { normalizeComercio, ruleKey } from '@/lib/services/commerceRules'
import { categoriaDeItem } from '@/lib/services/planCategories'
import { toColombiaDate } from '@/lib/utils/mesContable'

// ── Qué es cada movimiento, en la vida real ─────────────────────────────────
//
// Una sola regla para toda la pantalla. Antes cada tarjeta sumaba a su manera
// (pagos de tarjeta contados dos veces, préstamos como ahorro, plata entre
// cuentas propias como ingreso) y los números no cuadraban entre sí.

export type Naturaleza =
  | 'INGRESO'            // sueldo, rendimientos: plata nueva
  | 'GASTO_FIJO'
  | 'GASTO_VARIABLE'
  | 'AHORRO_APORTE'
  | 'AHORRO_RETIRO'
  | 'NO_CUENTA'          // pagos de tarjeta, entre mis cuentas, préstamos, reembolsos

type Tx = Pick<Transaction, 'tipo' | 'categoria' | 'capa_override' | 'subcategoria' | 'monto'>

export function naturaleza(tx: Tx, capaOverrides: Record<string, Capa>): Naturaleza {
  if (isIngreso(tx.tipo)) {
    if (tx.subcategoria === SUBCATEGORIA_RETIRO_AHORROS) return 'AHORRO_RETIRO'
    // Solo la categoría Ingreso es plata nueva. Una entrada clasificada como
    // Préstamo (te pagaron lo que te debían), Entre mis cuentas o
    // Reembolsable no es ingreso.
    return tx.categoria === 'INGRESO' ? 'INGRESO' : 'NO_CUENTA'
  }
  if (tx.tipo === 'ABONO_DEUDA') return 'NO_CUENTA'

  const capa = countedCapa(tx, capaOverrides)
  if (capa === 'AHORRO') return 'AHORRO_APORTE'
  if (capa === null) return 'NO_CUENTA'
  return capa === 'FIJO' ? 'GASTO_FIJO' : 'GASTO_VARIABLE'
}

export function esGasto(n: Naturaleza): boolean {
  return n === 'GASTO_FIJO' || n === 'GASTO_VARIABLE'
}

// ── Por revisar ─────────────────────────────────────────────────────────────

/** Desde este monto una salida sin categoría clara pesa lo suficiente para preguntar. */
export const UMBRAL_REVISION = 200_000

export type MotivoRevision = 'ENTRADA' | 'SALIDA_GRANDE'

/**
 * Movimientos que la app no puede interpretar sola y cambian los números:
 * - una transferencia que te llegó: ¿es ingreso, te pagaron algo, o es tuya?
 * - una salida grande sin categoría clara (Otro / Transferencia)
 * Desaparece apenas se le cambia la categoría o se confirma como está.
 */
export function motivoRevision(tx: Tx): MotivoRevision | null {
  // Ya se respondió (pagado_con_ahorros es la marca de una versión anterior;
  // hoy cuenta como gasto normal, pero igual es una respuesta).
  if (tx.subcategoria === SUBCATEGORIA_CONFIRMADO || tx.subcategoria === SUBCATEGORIA_PAGADO_CON_AHORROS) return null
  if (tx.tipo === 'TRANSFERENCIA_RECIBIDA' && tx.categoria === 'INGRESO') return 'ENTRADA'
  if (
    !isIngreso(tx.tipo) &&
    tx.tipo !== 'ABONO_DEUDA' &&
    Number(tx.monto) >= UMBRAL_REVISION &&
    (tx.categoria === 'OTRO' || tx.categoria === 'TRANSFERENCIA')
  ) return 'SALIDA_GRANDE'
  return null
}

// ── Resumen del mes ─────────────────────────────────────────────────────────

/** Desde este monto, un gasto variable que no se repite es un imprevisto */
export const UMBRAL_IMPREVISTO = 300_000

export interface PlanBase {
  ingresoNetoMensual: number
  fijoTotalMonto: number
  ahorroMetaMonto: number
  /** Reserva para gastos grandes que no se repiten */
  imprevistosMonto?: number
  /** Desglose opcional de fijos; si existe, se arma la lista para chulear */
  fijoItems?: BudgetSubcat[]
}

// ── Fijos como lista para chulear ───────────────────────────────────────────

export type EstadoFijo = 'pagado' | 'parcial' | 'pendiente'

export interface FijoItem {
  nombre: string
  categoria: string
  planeado: number
  pagado: number
  estado: EstadoFijo
  /** Cuánto se pagó por encima de lo planeado (0 si está dentro de un 10%) */
  exceso: number
  txs: Transaction[]
}

export interface FijosChecklist {
  items: FijoItem[]
  /** Pagos fijos que no corresponden a ningún ítem del plan */
  sinItem: Transaction[]
  pagados: number
  /** Lo que falta pagar de lo planeado */
  pendiente: number
}

function contieneNombre(comercio: string | null, nombre: string): boolean {
  const c = ` ${normalizeComercio(comercio)} `
  const n = normalizeComercio(nombre)
  return n.length > 0 && c.includes(` ${n} `)
}

/**
 * Empareja cada ítem del desglose de fijos con lo que de verdad se pagó:
 * primero por categoría (el ítem "Gym" es la categoría GYM), y si no, por
 * nombre ("Arriendo" con la transferencia que se llama "Arriendo"). Cada
 * pago cuenta para un solo ítem. Los aportes a ahorro también pueden pagar
 * un ítem por categoría (ej. un ítem "Inversión" con un aporte de Inversión).
 */
export function armarChecklistFijos(
  items: BudgetSubcat[],
  fijoTxs: Transaction[],
  aporteTxs: Transaction[]
): FijosChecklist {
  const usados = new Set<string>()
  const lista = items.filter(i => i.nombre?.trim()).map(i => ({
    nombre: i.nombre.trim(),
    categoria: categoriaDeItem(i.nombre),
    planeado: Number(i.monto) || 0,
    txs: [] as Transaction[],
  }))

  for (const it of lista) {
    for (const t of [...fijoTxs, ...aporteTxs]) {
      if (!usados.has(t.id) && t.categoria === it.categoria) { it.txs.push(t); usados.add(t.id) }
    }
  }
  for (const it of lista) {
    for (const t of fijoTxs) {
      if (!usados.has(t.id) && contieneNombre(t.comercio, it.nombre)) { it.txs.push(t); usados.add(t.id) }
    }
  }

  const out: FijoItem[] = lista.map(it => {
    const pagado = it.txs.reduce((s, t) => s + Number(t.monto), 0)
    // Solo se chulea al completar lo planeado: $470 mil de $500 mil es "faltan $30 mil", no "pagado".
    const estado: EstadoFijo = pagado === 0 ? 'pendiente' : pagado >= it.planeado ? 'pagado' : 'parcial'
    const exceso = pagado > it.planeado * 1.1 ? pagado - it.planeado : 0
    return { ...it, pagado, estado, exceso }
  })

  return {
    items: out,
    sinItem: fijoTxs.filter(t => !usados.has(t.id)).sort((a, b) => b.monto - a.monto),
    pagados: out.filter(i => i.estado === 'pagado').length,
    pendiente: out.reduce((s, i) => s + Math.max(0, i.planeado - i.pagado), 0),
  }
}

// ── Pagos que se repiten cada mes y no están en el plan ─────────────────────

export interface PagoRecurrente {
  nombre: string
  monto: number
  meses: number
}

/**
 * Gastos del mismo comercio (o a la misma cuenta) que aparecen en al menos 2
 * de los meses anteriores, una o dos veces por mes y por un monto parecido,
 * y que no corresponden a ningún ítem del plan. Uber o los cafés quedan
 * fuera porque aparecen muchas veces al mes.
 */
/**
 * Imprevisto: lo que cae en "Otro" (lo que no estaba en ninguna categoría
 * que planeaste), o un gasto grande (≥ $300 mil) que no se repite cada mes.
 * Un recibo (PAGO_SERVICIO: acueducto, luz…) nunca lo es aunque llegue cada
 * dos meses: es un gasto esperado. Se aplica sobre gastos variables (lo fijo
 * de hecho se separa antes con esFijoDeHecho).
 */
export function esImprevisto(t: Transaction, recurrentes: Set<string>): boolean {
  if (t.categoria === 'OTRO') return true
  const key = ruleKey(t)
  return t.tipo !== 'PAGO_SERVICIO' && Number(t.monto) >= UMBRAL_IMPREVISTO && !(key && recurrentes.has(key))
}

/**
 * Un gasto de categoría variable que en la práctica es fijo: se llama como un
 * ítem de tu plan (la transferencia "Arriendo" categorizada como Hogar) o se
 * repite cada mes por un monto parecido (Anthropic, la cuota del Fondo).
 */
export function esFijoDeHecho(t: Transaction, itemsFijos: BudgetSubcat[], recurrentes: Set<string>): boolean {
  if (itemsFijos.some(i => contieneNombre(t.comercio, i.nombre))) return true
  const key = ruleKey(t)
  return !!key && recurrentes.has(key)
}

/**
 * Grupos (por comercio o cuenta destino) que se repiten mes a mes: aparecen
 * en al menos 2 meses distintos, una o dos veces por mes, por un monto
 * parecido (±25%) de al menos $20 mil. Uber o los cafés no entran porque
 * aparecen muchas veces al mes.
 */
export function gruposRecurrentes(
  txs: Transaction[],
  capaOverrides: Record<string, Capa>
): Map<string, Transaction[]> {
  const grupos = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (!t.mes_contable || !esGasto(naturaleza(t, capaOverrides))) continue
    const key = ruleKey(t)
    if (!key) continue
    grupos.set(key, [...(grupos.get(key) ?? []), t])
  }
  const out = new Map<string, Transaction[]>()
  for (const [key, g] of grupos) {
    const porMes = new Map<string, number>()
    for (const t of g) porMes.set(t.mes_contable!, (porMes.get(t.mes_contable!) ?? 0) + 1)
    if (porMes.size < 2 || [...porMes.values()].some(n => n > 2)) continue
    const montos = g.map(t => Number(t.monto)).sort((x, y) => x - y)
    const mediana = montos[Math.floor(montos.length / 2)]
    if (mediana < 20_000 || montos.some(m => Math.abs(m - mediana) > mediana * 0.25)) continue
    out.set(key, g)
  }
  return out
}

export function pagosRecurrentesFueraDelPlan(
  txsAnteriores: Transaction[],
  capaOverrides: Record<string, Capa>,
  items: BudgetSubcat[]
): PagoRecurrente[] {
  const catsPlan = new Set(items.map(i => categoriaDeItem(i.nombre)))
  const out: PagoRecurrente[] = []
  for (const g of gruposRecurrentes(txsAnteriores, capaOverrides).values()) {
    const ultimo = [...g].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    if (catsPlan.has(ultimo.categoria) || items.some(i => contieneNombre(ultimo.comercio, i.nombre))) continue
    const meses = new Set(g.map(t => t.mes_contable)).size
    out.push({ nombre: ultimo.comercio?.trim() || 'Pago recurrente', monto: Number(ultimo.monto), meses })
  }
  return out.sort((a, b) => b.monto - a.monto).slice(0, 5)
}

export interface GrupoCategoria {
  categoria: string
  monto: number
  txs: Transaction[]
}

export interface MonthSummary {
  /** Lo que te entró como ingreso de verdad (sueldo, rendimientos…) */
  recibido: number
  /** Lo que gastaste: fijos + día a día + imprevistos. Una sola definición para toda la app. */
  gastado: number
  fijoReal: number
  /** Todo el gasto variable, imprevistos incluidos (para "En qué se fue") */
  variableReal: number
  /** Imprevistos: lo que cae en "Otro" y los gastos grandes que no se repiten (ver esImprevisto) */
  imprevistosReal: number
  imprevistosTxs: Transaction[]
  imprevistosPlan: number
  /** Lista para chulear, solo si el plan tiene desglose de fijos */
  fijos: FijosChecklist | null
  metaAhorro: number

  /** Presupuesto del día a día para esta semana: lo que queda del mes para el
   * día a día (plan − lo que fijos e imprevistos se
   * pasaron − lo gastado antes del lunes), repartido entre los días que
   * faltan. Cada lunes es un nuevo comienzo. 0 si no es el mes en curso. */
  presupuestoSemana: number
  /** Lo que el plan da por semana para el día a día, si todo va según lo planeado */
  ritmoPlanSemana: number
  /** El mes ya se salió del plan: lo que queda no alcanza para el ritmo planeado */
  mesFueraDelPlan: boolean
  /** Lo que queda del mes para el día a día, descontando lo gastado esta semana (puede ser negativo) */
  quedaMes: number
  /** Gasto del día a día (sin imprevistos) desde el lunes (o el 1 del mes) hasta hoy */
  gastoSemana: number

  aportes: number
  retiros: number
  ahorroNeto: number

  variablePorCategoria: GrupoCategoria[]
  fijoPorCategoria: GrupoCategoria[]
  ahorroTxs: Transaction[]
  porRevisar: { tx: Transaction; motivo: MotivoRevision }[]
}

function agrupar(txs: Transaction[]): GrupoCategoria[] {
  const map = new Map<string, GrupoCategoria>()
  for (const t of txs) {
    const g = map.get(t.categoria) ?? { categoria: t.categoria, monto: 0, txs: [] }
    g.monto += Number(t.monto)
    g.txs.push(t)
    map.set(t.categoria, g)
  }
  for (const g of map.values()) g.txs.sort((a, b) => b.monto - a.monto)
  return [...map.values()].sort((a, b) => b.monto - a.monto)
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function lunesDe(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow)
}

function diasEntre(a: string, b: string): number {
  const ms = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((ms(b) - ms(a)) / 86_400_000)
}

/**
 * Todo lo que muestra la pantalla principal sale de aquí, recalculado desde
 * las transacciones cada vez. No hay semanas guardadas ni saldos arrastrados:
 * si corriges un dato, el número se corrige solo.
 *
 * @param hoy 'YYYY-MM-DD' en hora Colombia
 */
export function computeMonthSummary(
  txs: Transaction[],
  capaOverrides: Record<string, Capa>,
  plan: PlanBase | null,
  mes: string,
  hoy: string,
  /** Claves de comercio que se repiten mes a mes (ver gruposRecurrentes):
   * un pago grande recurrente no es imprevisto */
  recurrentes: Set<string> = new Set()
): MonthSummary {
  const fijoTxs: Transaction[] = []
  const variableTxs: Transaction[] = []
  const ahorroTxs: Transaction[] = []
  let ingresoReal = 0, aportes = 0, retiros = 0
  const porRevisar: MonthSummary['porRevisar'] = []

  for (const t of txs) {
    const n = naturaleza(t, capaOverrides)
    const monto = Number(t.monto)
    if (n === 'INGRESO') ingresoReal += monto
    else if (n === 'GASTO_FIJO' || (n === 'GASTO_VARIABLE' && esFijoDeHecho(t, plan?.fijoItems ?? [], recurrentes))) fijoTxs.push(t)
    else if (n === 'GASTO_VARIABLE') variableTxs.push(t)
    else if (n === 'AHORRO_APORTE') { aportes += monto; ahorroTxs.push(t) }
    else if (n === 'AHORRO_RETIRO') { retiros += monto; ahorroTxs.push(t) }

    const motivo = motivoRevision(t)
    if (motivo) porRevisar.push({ tx: t, motivo })
  }

  const sum = (a: Transaction[]) => a.reduce((s, t) => s + Number(t.monto), 0)
  const fijoReal = sum(fijoTxs)
  const variableReal = sum(variableTxs)
  const imprevistosTxs = variableTxs.filter(t => esImprevisto(t, recurrentes)).sort((a, b) => b.monto - a.monto)
  const imprevistosReal = sum(imprevistosTxs)
  const imprevistosPlan = plan?.imprevistosMonto ?? 0

  const aporteTxs = ahorroTxs.filter(t => naturaleza(t, capaOverrides) === 'AHORRO_APORTE')
  const fijos = plan?.fijoItems?.length ? armarChecklistFijos(plan.fijoItems, fijoTxs, aporteTxs) : null
  const metaAhorro = plan?.ahorroMetaMonto ?? 0

  // ── Presupuesto: sale solo de lo que ya está en el plan ──
  const tienePlan = !!plan && plan.ingresoNetoMensual > 0

  const [y, m] = mes.split('-').map(Number)
  const inicioMes = `${mes}-01`
  const finMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const diasMes = diasEntre(inicioMes, finMes) + 1

  // ── La semana como nuevo comienzo ──
  // Cada lunes, lo que queda del mes para el día a día se reparte entre los
  // días que faltan. Si te pasaste antes (en día a día, en fijos por encima
  // de lo planeado o en imprevistos), las semanas que quedan se ajustan solas;
  // si gastaste menos, tienes más. Durante la semana el número no se mueve:
  // solo depende de lo gastado antes del lunes.
  let presupuestoSemana = 0, gastoSemana = 0, ritmoPlanSemana = 0, quedaMes = 0, mesFueraDelPlan = false
  if (hoy >= inicioMes && hoy <= finMes) {
    const lunes = lunesDe(hoy)
    const inicioSemana = lunes < inicioMes ? inicioMes : lunes
    const finSemana = addDays(lunes, 6) > finMes ? finMes : addDays(lunes, 6)
    const diaADiaTxs = variableTxs.filter(t => !esImprevisto(t, recurrentes))
    gastoSemana = sum(diaADiaTxs.filter(t => {
      const d = toColombiaDate(t.fecha)
      return d >= inicioSemana && d <= hoy
    }))
    const gastoAntes = sum(diaADiaTxs.filter(t => toColombiaDate(t.fecha) < inicioSemana))

    if (tienePlan) {
      const diaADiaPlan = Math.max(0, plan!.ingresoNetoMensual - metaAhorro - plan!.fijoTotalMonto - imprevistosPlan)
      ritmoPlanSemana = (diaADiaPlan / diasMes) * 7
      // Lo que de verdad hay para el día a día este mes: lo planeado menos lo
      // que fijos e imprevistos se pasaron. Sacar de tus ahorros NO suma: es
      // la señal de que algo no estaba en el plan, y se ve aparte en el ahorro.
      const pool = diaADiaPlan
        - Math.max(0, fijoReal - plan!.fijoTotalMonto)
        - Math.max(0, imprevistosReal - imprevistosPlan)
      const queda = pool - gastoAntes
      const diasDesdeInicioSemana = diasEntre(inicioSemana, finMes) + 1
      const diasSemana = diasEntre(inicioSemana, finSemana) + 1
      presupuestoSemana = Math.max(0, queda) * (diasSemana / diasDesdeInicioSemana)
      quedaMes = queda - gastoSemana
      // El mes se salió del plan si lo que queda no da ni para la mitad del ritmo planeado
      const alRitmo = ritmoPlanSemana * (diasDesdeInicioSemana / 7)
      mesFueraDelPlan = queda < alRitmo * 0.5
    }
  }

  return {
    recibido: ingresoReal,
    gastado: fijoReal + variableReal,
    fijoReal,
    variableReal,
    imprevistosReal,
    imprevistosTxs,
    imprevistosPlan,
    fijos,
    metaAhorro,
    presupuestoSemana,
    ritmoPlanSemana,
    mesFueraDelPlan,
    quedaMes,
    gastoSemana,
    aportes,
    retiros,
    ahorroNeto: aportes - retiros,
    variablePorCategoria: agrupar(variableTxs),
    fijoPorCategoria: agrupar(fijoTxs),
    ahorroTxs: [...ahorroTxs].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    porRevisar,
  }
}
