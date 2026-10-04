'use client'

// CategoriesCard — fusión de SpendingChart (dona) + BudgetOverview (barras de
// cumplimiento) en un solo card con segmented control "Presupuesto / Participación".
// Antes vivían por separado y, en modo barras, dibujaban la misma fila dos veces.
// Ver design_handoff_rediseno_visual/README.md — Módulo 1.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Pencil, PieChart, BarChart3, Check, Tags } from 'lucide-react'
import {
  getCategoryColor,
  catLabel,
  formatCOPCompact,
  isGasto,
  isIngreso,
  zoneColor,
  type Categoria,
  type Capa,
  type Transaction,
  type BudgetEntry,
} from '@/lib/types'
import { computeLayerTotals, computeIngresoReal, countedCapa, isSalidaFueraDelPlan } from '@/lib/services/layerService'
import LayerDetail from './LayerDetail'
import BudgetManager from './BudgetManager'
import SavingsOverview from './SavingsOverview'
import { getCategoryIcon } from '@/lib/categoryIcons'
import { TEST_IDS } from '@/lib/testIds'
import styles from './CategoriesCard.module.css'

type DraftMap = Record<string, BudgetEntry>
type View = 'presupuesto' | 'participacion'
type StatKey = 'ahorro' | 'fijo' | 'variable'

interface Props {
  mes: string
  transactions: Transaction[]
  /** Overrides de capa por categoría — los carga DashboardClient una sola vez */
  capaOverrides: Record<string, Capa>
  activeFilter: string
  onFilterChange: (key: string) => void
  onBudgetsChange: (totals: Record<string, number>) => void
  onSaved: () => void
  /** Ahorro ahora se ve (y se administra) dentro de esta tarjeta — antes
   * SavingsOverview vivía como su propia tarjeta suelta en el dashboard,
   * mostrando un segundo número de "ahorro" sin relación visible con la
   * meta del mes. onSavingsTransaction/savingsRefreshSignal son los mismos
   * callbacks que antes recibía directo desde DashboardClient. */
  onSavingsTransaction: () => void
  savingsRefreshSignal: number
  /** Abre la hoja de Categorías (cambiar Variable/Fijo/Ahorro, crear, eliminar) */
  onManageCategories: () => void
}

// ── Dona: helpers SVG (sin cambios de lógica, movidos desde SpendingChart) ────

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function donutArc(cx: number, cy: number, oR: number, iR: number, a0: number, a1: number): string {
  if (a1 - a0 >= 360) a1 = a0 + 359.99
  const [x0, y0] = polar(cx, cy, oR, a0)
  const [x1, y1] = polar(cx, cy, oR, a1)
  const [x2, y2] = polar(cx, cy, iR, a1)
  const [x3, y3] = polar(cx, cy, iR, a0)
  const lg = a1 - a0 > 180 ? 1 : 0
  const f = (v: number) => v.toFixed(2)
  return `M${f(x0)},${f(y0)} A${oR},${oR} 0 ${lg},1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${iR},${iR} 0 ${lg},0 ${f(x3)},${f(y3)} Z`
}

interface ChartEntry {
  name: string
  value: number
  fill: string
  categoria: Categoria
  a0: number
  a1: number
  pct: number
}

/** Si hay más categorías con gasto que este límite, se muestran solo las
 * primeras (por monto) — el resto se descarta en vez de agruparse, así que
 * el % queda calculado sobre lo efectivamente mostrado. La leyenda hace
 * scroll si aun así no entran todas en pantalla. */
const MAX_CHART_SLICES = 10

function buildChartData(transactions: Transaction[]): ChartEntry[] {
  const totals: Partial<Record<string, number>> = {}
  for (const t of transactions) {
    const include =
      isGasto(t.tipo, t.categoria) ||
      t.categoria === 'AHORROS' ||
      t.categoria === 'PRESTAMO' ||
      (t.categoria === 'TRANSFERENCIA' && !isIngreso(t.tipo))
    if (!include) continue
    totals[t.categoria] = (totals[t.categoria] ?? 0) + t.monto
  }
  const sorted = Object.entries(totals)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([cat, value]) => ({
      name: catLabel(cat),
      value: value!,
      fill: getCategoryColor(cat),
      categoria: cat as Categoria,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_CHART_SLICES)

  const total = sorted.reduce((s, d) => s + d.value, 0)
  let ang = 0
  return sorted.map(d => {
    const pct = total > 0 ? d.value / total : 0
    const a0 = ang
    const a1 = ang + pct * 360
    ang = a1
    return { ...d, a0, a1, pct }
  })
}

// ── Valor de cada columna de la fila de 3 números — reemplaza lo que antes
// eran 3 tarjetas con ícono + monto + barra + badge + subtítulo cada una (5
// barras casi idénticas en la misma pantalla entre Mes, Semana y las 3
// capas). Ahora es solo un número: un check en círculo cuando se cumple la
// meta/límite, o el % en texto plano. Ahorro usa semántica de meta (llegar o
// superar es bueno); Fijo/Variable usan semántica de límite (superarlo es
// la señal de alerta) — mismo criterio que ya regía los badges viejos.
function CheckDot({ color }: { color: string }) {
  return (
    <span className={styles.checkDot}>
      <Check size={16} strokeWidth={3} color={color} />
    </span>
  )
}

function StatValue({ pct, kind }: { pct: number | null; kind: 'goal' | 'limit' }) {
  if (pct === null) return <span className={styles.statValueEmpty}>-</span>

  if (kind === 'goal') {
    return pct >= 100
      ? <CheckDot color="var(--green)" />
      : <span className={styles.statValue} style={{ color: 'var(--blue)' }}>{Math.round(pct)}%</span>
  }

  if (pct >= 100 && pct < 110) return <CheckDot color="var(--green)" />
  const label = pct >= 110 ? `+${Math.round(pct - 100)}%` : `${Math.round(pct)}%`
  return <span className={styles.statValue} style={{ color: zoneColor(pct) }}>{label}</span>
}

export default function CategoriesCard({
  mes, transactions, capaOverrides, activeFilter, onFilterChange, onBudgetsChange, onSaved,
  onSavingsTransaction, savingsRefreshSignal, onManageCategories,
}: Props) {
  const [draftMap, setDraftMap] = useState<DraftMap>({})
  const [editing, setEditing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [plan, setPlan] = useState<{ ingresoNetoMensual: number; fijoTotalMonto: number; ahorroMetaMonto: number } | null>(null)
  const [view, setView] = useState<View>('presupuesto')
  const [chartMode, setChartMode] = useState<'donut' | 'bars'>('donut')
  const [expandedStat, setExpandedStat] = useState<StatKey | null>(null)
  const toggleStat = (key: StatKey) => setExpandedStat(prev => prev === key ? null : key)

  const budgets: Record<string, number> = Object.fromEntries(
    Object.entries(draftMap).map(([k, v]) => [k, v.monto])
  )

  const loadBudgets = useCallback(() => {
    fetch(`/api/budgets?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        const raw: DraftMap = d.budgets ?? {}
        setDraftMap(raw)
        const totals = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.monto]))
        onBudgetsChange(totals)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  const loadPlan = useCallback(() => {
    fetch(`/api/monthly-plan?mes=${mes}`)
      .then(r => r.json())
      .then(d => setPlan(d.plan ?? null))
      .catch(() => setPlan(null))
  }, [mes])

  useEffect(() => { loadBudgets() }, [loadBudgets])
  useEffect(() => { loadPlan() }, [loadPlan])

  // ── Vista Presupuesto: 3 capas (Ahorro / Fijo / Variable) ──────────────────
  // El gasto real por capa sale de las transacciones (computeLayerTotals ya
  // sabe que Ahorro cuenta como "apartado" aunque isGasto lo excluya del
  // gasto tradicional). El "límite" de cada capa sale del plan mensual:
  // Ahorro compara contra la meta, Fijo contra el total declarado (un solo
  // número, ya no una suma de presupuestos por categoría), Variable contra
  // el pool derivado (ingreso - fijos - ahorro).
  const layerTotals = useMemo(() => computeLayerTotals(transactions, capaOverrides), [transactions, capaOverrides])
  const ingresoReal = useMemo(() => computeIngresoReal(transactions), [transactions])
  const fijoPresupuestado = plan?.fijoTotalMonto ?? 0
  const poolVariable = plan
    ? Math.max(0, plan.ingresoNetoMensual - fijoPresupuestado - plan.ahorroMetaMonto)
    : 0

  const pctDeIngreso = (monto: number) =>
    plan && plan.ingresoNetoMensual > 0 ? Math.round((monto / plan.ingresoNetoMensual) * 100) : null

  // Mismas transacciones que suman en cada capa (countedCapa es la regla
  // única), para que el detalle reconstruya exactamente el número de arriba.
  const txsPorCapa = useMemo(() => {
    const out: Record<StatKey, Transaction[]> = { ahorro: [], fijo: [], variable: [] }
    for (const t of transactions) {
      const capa = countedCapa(t, capaOverrides)
      if (capa) out[capa === 'AHORRO' ? 'ahorro' : capa === 'FIJO' ? 'fijo' : 'variable'].push(t)
    }
    return out
  }, [transactions, capaOverrides])

  // Salidas que no suman en ninguna capa — préstamos y transferencias sin
  // categorizar. Se muestran aparte para que nada "desaparezca" del total.
  const fueraDelPlan = useMemo(() => {
    const porCat = new Map<string, number>()
    for (const t of transactions) {
      if (!isSalidaFueraDelPlan(t, capaOverrides)) continue
      porCat.set(t.categoria, (porCat.get(t.categoria) ?? 0) + Number(t.monto))
    }
    return [...porCat.entries()].sort((a, b) => b[1] - a[1])
  }, [transactions, capaOverrides])

  const diasRestantesMes = useMemo(() => {
    const [y, m] = mes.split('-').map(Number)
    const today = new Date()
    if (today.getFullYear() !== y || today.getMonth() + 1 !== m) return 0
    return new Date(y, m, 0).getDate() - today.getDate()
  }, [mes])

  const pctTxt = (monto: number) => {
    const p = pctDeIngreso(monto)
    return p !== null ? ` (${p}% de tu ingreso)` : ''
  }
  const origenPorCapa: Record<StatKey, string | null> = {
    ahorro: plan && plan.ahorroMetaMonto > 0
      ? `Meta que definiste${pctTxt(plan.ahorroMetaMonto)}. Suma lo que categorices como Ahorros o Inversión, recomendado 20-30% de tu ingreso.`
      : null,
    fijo: fijoPresupuestado > 0
      ? `Total de fijos que declaraste${pctTxt(fijoPresupuestado)}. Suma Hogar, Suscripciones, Salud, Educación, Deuda y tus categorías marcadas como Fijo.`
      : null,
    variable: plan && poolVariable > 0
      ? `Ingreso ${formatCOPCompact(plan.ingresoNetoMensual)} − Fijos ${formatCOPCompact(fijoPresupuestado)} − Ahorro ${formatCOPCompact(plan.ahorroMetaMonto)} = ${formatCOPCompact(poolVariable)}. Se reparte en tu cupo semanal.`
      : null,
  }
  const limitePorCapa: Record<StatKey, number> = {
    ahorro: plan?.ahorroMetaMonto ?? 0,
    fijo: fijoPresupuestado,
    variable: poolVariable,
  }
  const toggleFilter = (cat: string) => onFilterChange(activeFilter === cat ? 'TODOS' : cat)

  // ── Vista Participación ────────────────────────────────────────────────────
  const chartData = useMemo(() => buildChartData(transactions), [transactions])
  const chartTotal = chartData.reduce((s, d) => s + d.value, 0)
  const S = 200, cx = S / 2, cy = S / 2, oR = 83, iR = 55
  const catActive = activeFilter !== 'TODOS' && !activeFilter.startsWith('BANCO:')
  const isEntrySelected = (entry: ChartEntry) => entry.categoria === activeFilter
  const handleEntryClick = (entry: ChartEntry) =>
    onFilterChange(isEntrySelected(entry) ? 'TODOS' : entry.categoria)
  const selEntry = catActive ? chartData.find(d => d.categoria === (activeFilter as Categoria)) : null
  const hasChartContent = chartData.length > 0

  // Las 3 tarjetas de capa siempre tienen algo que mostrar (aunque sea en
  // cero, con un hint para configurar el plan) — nunca queda un estado vacío
  // confuso en la pestaña Presupuesto. Solo la pestaña Gráfico puede estar
  // realmente vacía (hasChartContent, manejado dentro de esa vista).
  const hasAnyContent = true

  if (!loaded) return (
    <div className={`card ${styles.skeletonWrap}`}>
      <div className={`skeleton ${styles.skeletonTitle}`} />
      {[80, 60, 90].map((w, i) => (
        <div key={i} className={styles.skeletonItem}>
          <div className={`skeleton ${styles.skeletonItemLabel}`} style={{ '--skel-w': `${w}%` } as React.CSSProperties} />
          <div className={`skeleton ${styles.skeletonItemBar}`} />
        </div>
      ))}
    </div>
  )

  if (editing) {
    return (
      <BudgetManager
        mes={mes}
        initialPlan={plan}
        ingresoReal={ingresoReal}
        onPlanChange={setPlan}
        onSaved={() => {
          onSaved()
          setEditing(false)
          loadPlan()
        }}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <div className={`card ${styles.cardOverflow}`}>

      {/* Header */}
      <div className={`${styles.header} ${!hasAnyContent ? styles.headerBordered : ''}`}>
        <p className={styles.headerTitle}>Tu Plan</p>
        <div className={styles.headerActions}>
          <button onClick={onManageCategories} className={styles.editBtn}>
            <Tags size={11} />
            Categorías
          </button>
          <button onClick={() => setEditing(true)} className={styles.editBtn}>
            <Pencil size={11} />
            Editar
          </button>
        </div>
      </div>

      {/* Segmented control */}
      {hasAnyContent && (
        <div className={styles.toggleRow}>
          <div className={styles.viewToggle} role="group" aria-label="Tipo de vista">
            <button
              onClick={() => setView('presupuesto')}
              aria-pressed={view === 'presupuesto'}
              className={`${styles.viewToggleBtn} ${view === 'presupuesto' ? styles.viewToggleBtnActive : ''}`}
            >
              Presupuesto
            </button>
            <button
              onClick={() => setView('participacion')}
              aria-pressed={view === 'participacion'}
              className={`${styles.viewToggleBtn} ${view === 'participacion' ? styles.viewToggleBtnActive : ''}`}
            >
              Gráfico
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasAnyContent && (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Sin transacciones este mes</p>
          <button onClick={() => setEditing(true)} className={styles.emptyBtn}>
            Configurar presupuesto
          </button>
        </div>
      )}

      {/* Vista Presupuesto — 3 números en una fila, no 3 tarjetas con barra
          cada una. El detalle (montos, % de tu ingreso, cuentas de ahorro)
          vive detrás de tocar la columna — nunca se muestra todo a la vez. */}
      {hasAnyContent && view === 'presupuesto' && (
        <>
          <div className={styles.statsRow}>
            <button
              className={styles.statCol}
              onClick={() => toggleStat('ahorro')}
              aria-expanded={expandedStat === 'ahorro'}
              aria-label="Ahorro, ver detalle"
            >
              <span className={styles.statLabel}>Ahorro</span>
              {plan && plan.ahorroMetaMonto > 0 && (
                <span className={styles.statAmounts}>
                  {formatCOPCompact(layerTotals.ahorro)} de {formatCOPCompact(plan.ahorroMetaMonto)}
                </span>
              )}
              <StatValue kind="goal" pct={plan && plan.ahorroMetaMonto > 0 ? (layerTotals.ahorro / plan.ahorroMetaMonto) * 100 : null} />
            </button>
            <div className={styles.statDivider} />
            <button
              className={styles.statCol}
              onClick={() => toggleStat('fijo')}
              aria-expanded={expandedStat === 'fijo'}
              aria-label="Gastos fijos, ver detalle"
            >
              <span className={styles.statLabel}>Fijo</span>
              {fijoPresupuestado > 0 && (
                <span className={styles.statAmounts}>
                  {formatCOPCompact(layerTotals.fijo)} de {formatCOPCompact(fijoPresupuestado)}
                </span>
              )}
              <StatValue kind="limit" pct={fijoPresupuestado > 0 ? (layerTotals.fijo / fijoPresupuestado) * 100 : null} />
            </button>
            <div className={styles.statDivider} />
            <button
              className={styles.statCol}
              onClick={() => toggleStat('variable')}
              aria-expanded={expandedStat === 'variable'}
              aria-label="Gasto variable, ver detalle"
            >
              <span className={styles.statLabel}>Variable</span>
              {poolVariable > 0 && (
                <span className={styles.statAmounts}>
                  {formatCOPCompact(layerTotals.variable)} de {formatCOPCompact(poolVariable)}
                </span>
              )}
              <StatValue kind="limit" pct={poolVariable > 0 ? (layerTotals.variable / poolVariable) * 100 : null} />
            </button>
          </div>
          <p className={styles.statsHint}>Toca cualquiera para ver el detalle</p>

          {fueraDelPlan.length > 0 && (
            <button
              className={styles.fueraNote}
              onClick={() => toggleFilter(fueraDelPlan[0][0])}
              aria-label="Ver en la lista las salidas que no cuentan en tu plan"
            >
              <span className={styles.fueraTitle}>Fuera de tu plan</span>
              <span className={styles.fueraBody}>
                {fueraDelPlan.map(([cat, monto]) => `${catLabel(cat)} ${formatCOPCompact(monto)}`).join(' · ')}
                {', '}préstamos y transferencias sin categoría no cuentan como gasto ni ahorro. Categorízalas si deberían.
              </span>
            </button>
          )}

          {expandedStat && (
            <div className={styles.detailPanel}>
              <LayerDetail
                kind={expandedStat}
                txs={txsPorCapa[expandedStat]}
                total={layerTotals[expandedStat]}
                limite={limitePorCapa[expandedStat]}
                origen={origenPorCapa[expandedStat]}
                diasRestantes={diasRestantesMes}
                activeFilter={activeFilter}
                onFilterCategory={toggleFilter}
              />
              {expandedStat === 'ahorro' && (
                <div className={styles.savingsWrap}>
                  <SavingsOverview onTransaction={onSavingsTransaction} refreshSignal={savingsRefreshSignal} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Vista Participación */}
      {hasAnyContent && view === 'participacion' && (
        hasChartContent ? (
          <>
          <div className={styles.chartTitle}>
            <div className={styles.chartTitleRow}>
              <div>
                <p className={styles.chartTitleMain}>Participación por categoría</p>
                <p className={styles.chartTitleSub}>Qué porcentaje de tu gasto total representa cada una este mes</p>
              </div>
              <div className={styles.chartModeToggle} role="group" aria-label="Tipo de gráfico">
                <button
                  onClick={() => setChartMode('donut')}
                  aria-pressed={chartMode === 'donut'}
                  aria-label="Ver como dona"
                  className={`${styles.chartModeBtn} ${chartMode === 'donut' ? styles.chartModeBtnActive : ''}`}
                >
                  <PieChart size={15} />
                </button>
                <button
                  onClick={() => setChartMode('bars')}
                  aria-pressed={chartMode === 'bars'}
                  aria-label="Ver como barras"
                  className={`${styles.chartModeBtn} ${chartMode === 'bars' ? styles.chartModeBtnActive : ''}`}
                >
                  <BarChart3 size={15} />
                </button>
              </div>
            </div>
          </div>

          <div className={styles.body}>
            {chartMode === 'bars' ? (
              <div className={styles.barsCol}>
                <div
                  className={styles.barsWrap}
                  data-testid={TEST_IDS.DASHBOARD_DONUT_CHART}
                  role="img"
                  aria-label="Gráfico de barras por categoría"
                >
                {chartData.map((sl, i) => {
                  const isSelected = isEntrySelected(sl)
                  const isDimmed = catActive && !isSelected
                  return (
                    <div
                      key={i}
                      className={styles.barCol}
                      role="button"
                      tabIndex={0}
                      data-testid={TEST_IDS.DASHBOARD_DONUT_SLICE}
                      aria-label={`${sl.name}: ${Math.round(sl.pct * 100)}%${isSelected ? ', activo, presiona para limpiar filtro' : ', presiona para filtrar'}`}
                      aria-pressed={isSelected}
                      onClick={() => handleEntryClick(sl)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleEntryClick(sl)
                        }
                      }}
                    >
                      <span
                        className={styles.barColFill}
                        style={{ height: `${Math.max(sl.pct * 100, 4)}%`, background: sl.fill, opacity: isDimmed ? 0.28 : 1 }}
                      />
                    </div>
                  )
                })}
                </div>
                <div className={styles.barsTotal}>
                  <span className={styles.barsTotalLabel}>{selEntry ? selEntry.name : 'Total'}</span>
                  <span
                    className={styles.barsTotalValue}
                    style={{ '--clr': selEntry ? selEntry.fill : 'var(--text)' } as React.CSSProperties}
                  >
                    {selEntry ? formatCOPCompact(selEntry.value) : formatCOPCompact(chartTotal)}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className={styles.donutWrap}
                data-testid={TEST_IDS.DASHBOARD_DONUT_CHART}
                role="img"
                aria-label="Gráfico de gastos por categoría"
              >
                <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
                  {chartData.map((sl, i) => {
                    const isSelected = isEntrySelected(sl)
                    const isDimmed = catActive && !isSelected
                    return (
                      <path
                        key={i}
                        d={donutArc(cx, cy, isSelected ? oR + 7 : oR, iR, sl.a0, sl.a1)}
                        fill={sl.fill}
                        stroke="var(--bg)"
                        strokeWidth="2.5"
                        opacity={isDimmed ? 0.28 : 1}
                        className={styles.slice}
                        role="button"
                        tabIndex={0}
                        data-testid={TEST_IDS.DASHBOARD_DONUT_SLICE}
                        aria-label={`${sl.name}: ${Math.round(sl.pct * 100)}%${isSelected ? ', activo, presiona para limpiar filtro' : ', presiona para filtrar'}`}
                        aria-pressed={isSelected}
                        onClick={() => handleEntryClick(sl)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleEntryClick(sl)
                          }
                        }}
                      />
                    )
                  })}
                </svg>

                <div
                  className={catActive ? `${styles.center} ${styles.centerActive}` : styles.center}
                  onClick={() => catActive && onFilterChange('TODOS')}
                  role={catActive ? 'button' : undefined}
                  aria-label={catActive ? 'Limpiar filtro de categoría' : undefined}
                  tabIndex={catActive ? 0 : undefined}
                  onKeyDown={catActive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilterChange('TODOS') } } : undefined}
                >
                  <span className={styles.centerLabel}>
                    {selEntry ? selEntry.name : 'total'}
                  </span>
                  <span
                    className={styles.centerValue}
                    style={{ '--clr': selEntry ? selEntry.fill : 'var(--text)' } as React.CSSProperties}
                  >
                    {selEntry ? formatCOPCompact(selEntry.value) : formatCOPCompact(chartTotal)}
                  </span>
                </div>
              </div>
            )}

            <div className={styles.legend}>
              {chartData.map((entry, i) => {
                const LegendIcon = getCategoryIcon(entry.categoria)
                const isSelected = isEntrySelected(entry)
                return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  className={styles.legendRow}
                  aria-pressed={isSelected}
                  aria-label={`${entry.name}: ${Math.round(entry.pct * 100)}%`}
                  onClick={() => handleEntryClick(entry)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleEntryClick(entry)
                    }
                  }}
                >
                  <div className={styles.legendHeader}>
                    <div className={styles.legendNameGroup}>
                      <div className={styles.legendIconDot} style={{ color: entry.fill }}>
                        <LegendIcon size={17} />
                      </div>
                      <span className={styles.legendName}>{entry.name}</span>
                    </div>
                    <span className={styles.legendPct}>{Math.round(entry.pct * 100)}%</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{ '--bar-w': `${entry.pct * 100}%`, '--bar-color': entry.fill } as React.CSSProperties}
                    />
                  </div>
                </div>
                )
              })}
            </div>
          </div>
          </>
        ) : (
          <p className={styles.emptyInline}>Sin datos de participación este mes</p>
        )
      )}
    </div>
  )
}
