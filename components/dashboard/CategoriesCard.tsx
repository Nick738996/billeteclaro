'use client'

// CategoriesCard — fusión de SpendingChart (dona) + BudgetOverview (barras de
// cumplimiento) en un solo card con segmented control "Presupuesto / Participación".
// Antes vivían por separado y, en modo barras, dibujaban la misma fila dos veces.
// Ver design_handoff_rediseno_visual/README.md — Módulo 1.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Pencil, PieChart, BarChart3 } from 'lucide-react'
import {
  getCategoryColor,
  catLabel,
  formatCOP,
  formatCOPCompact,
  isGasto,
  isIngreso,
  zoneColor,
  type Categoria,
  type Transaction,
  type BudgetEntry,
} from '@/lib/types'
import { computeLayerTotals, isFijoBudgetCategory } from '@/lib/services/layerService'
import BudgetManager from './BudgetManager'
import { getCategoryIcon } from '@/lib/categoryIcons'
import { TEST_IDS } from '@/lib/testIds'
import styles from './CategoriesCard.module.css'

type DraftMap = Record<string, BudgetEntry>
type View = 'presupuesto' | 'participacion'

interface Props {
  mes: string
  transactions: Transaction[]
  gastosPorCategoria: Record<string, number>
  ingresos: number
  activeFilter: string
  onFilterChange: (key: string) => void
  onBudgetsChange: (totals: Record<string, number>) => void
  onSaved: () => void
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

export default function CategoriesCard({
  mes, transactions, gastosPorCategoria, ingresos, activeFilter, onFilterChange, onBudgetsChange, onSaved,
}: Props) {
  const [draftMap, setDraftMap] = useState<DraftMap>({})
  const [editing, setEditing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [plan, setPlan] = useState<{ ingresoNetoMensual: number; ahorroMetaMonto: number } | null>(null)
  const [view, setView] = useState<View>('presupuesto')
  const [chartMode, setChartMode] = useState<'donut' | 'bars'>('donut')

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
  // Ahorro compara contra la meta, Fijo contra lo presupuestado por
  // categoría, Variable contra el pool derivado (ingreso - fijos - ahorro).
  const layerTotals = useMemo(() => computeLayerTotals(transactions, {}), [transactions])
  const fijoPresupuestado = Object.entries(budgets)
    .filter(([cat]) => isFijoBudgetCategory(cat))
    .reduce((s, [, v]) => s + v, 0)
  const poolVariable = plan
    ? Math.max(0, plan.ingresoNetoMensual - fijoPresupuestado - plan.ahorroMetaMonto)
    : 0

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
        gastosPorCategoria={gastosPorCategoria}
        initialBudgets={draftMap}
        initialPlan={plan}
        onBudgetsChange={newTotals => {
          setDraftMap(prev => {
            const next: DraftMap = {}
            for (const [k, v] of Object.entries(newTotals)) {
              next[k] = prev[k] ? { ...prev[k], monto: v } : { monto: v, subcategorias: [] }
            }
            return next
          })
          onBudgetsChange(newTotals)
        }}
        onPlanChange={setPlan}
        onSaved={() => {
          onSaved()
          setEditing(false)
          loadBudgets()
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
        <p className={styles.headerTitle}>Categorías</p>
        <button onClick={() => setEditing(true)} className={styles.editBtn}>
          <Pencil size={11} />
          Editar
        </button>
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

      {/* Vista Presupuesto — 3 Capas (Ahorro / Fijo / Variable), no una lista
          plana por categoría: el modelo de la app es "controla el bosque",
          no 13 microcategorías. Editar sigue siendo el camino para ajustar
          ingreso, meta de ahorro y cada gasto fijo. */}
      {hasAnyContent && view === 'presupuesto' && (
        <>
          {/* Ahorro y Blindaje */}
          <div className={styles.layerBlock}>
            <div className={styles.layerHeader}>
              <span className={styles.layerName}>Ahorro y Blindaje</span>
              <span className={styles.amounts}>
                <span className={styles.spent}>{formatCOP(layerTotals.ahorro)}</span>
                {plan && plan.ahorroMetaMonto > 0 && <span className={styles.limit}> / {formatCOP(plan.ahorroMetaMonto)}</span>}
              </span>
            </div>
            {plan && plan.ahorroMetaMonto > 0 ? (
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    '--bar-w': `${Math.min((layerTotals.ahorro / plan.ahorroMetaMonto) * 100, 100)}%`,
                    '--bar-color': layerTotals.ahorro >= plan.ahorroMetaMonto ? 'var(--green)' : 'var(--blue)',
                  } as React.CSSProperties}
                />
              </div>
            ) : (
              <p className={styles.layerHint}>Define tu meta de ahorro en Editar</p>
            )}
          </div>

          {/* Gastos Fijos */}
          <div className={`${styles.layerBlock} ${styles.layerBlockBorder}`}>
            <div className={styles.layerHeader}>
              <span className={styles.layerName}>Gastos Fijos</span>
              <span className={styles.amounts}>
                <span className={styles.spent}>{formatCOP(layerTotals.fijo)}</span>
                {fijoPresupuestado > 0 && <span className={styles.limit}> / {formatCOP(fijoPresupuestado)}</span>}
              </span>
            </div>
            {fijoPresupuestado > 0 ? (
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    '--bar-w': `${Math.min((layerTotals.fijo / fijoPresupuestado) * 100, 100)}%`,
                    '--bar-color': zoneColor((layerTotals.fijo / fijoPresupuestado) * 100),
                  } as React.CSSProperties}
                />
              </div>
            ) : (
              <p className={styles.layerHint}>Agrega tus gastos fijos (arriendo, suscripciones…) en Editar</p>
            )}
          </div>

          {/* Gasto Variable (derivado, sin presupuesto por categoría) */}
          <div className={`${styles.layerBlock} ${styles.layerBlockBorder}`}>
            <div className={styles.layerHeader}>
              <span className={styles.layerName}>Gasto Variable</span>
              <span className={styles.amounts}>
                <span className={styles.spent}>{formatCOP(layerTotals.variable)}</span>
                {poolVariable > 0 && <span className={styles.limit}> / {formatCOP(poolVariable)}</span>}
              </span>
            </div>
            {poolVariable > 0 ? (
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    '--bar-w': `${Math.min((layerTotals.variable / poolVariable) * 100, 100)}%`,
                    '--bar-color': zoneColor((layerTotals.variable / poolVariable) * 100),
                  } as React.CSSProperties}
                />
              </div>
            ) : (
              <p className={styles.layerHint}>Define tu ingreso en Editar para ver tu pool variable</p>
            )}
            <p className={styles.layerFootnote}>Se reparte solo en tu cupo semanal, mira la tarjeta de arriba</p>
          </div>
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
