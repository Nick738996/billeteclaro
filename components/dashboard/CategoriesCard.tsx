'use client'

// CategoriesCard — fusión de SpendingChart (dona) + BudgetOverview (barras de
// cumplimiento) en un solo card con segmented control "Presupuesto / Participación".
// Antes vivían por separado y, en modo barras, dibujaban la misma fila dos veces.
// Ver design_handoff_rediseno_visual/README.md — Módulo 1.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Pencil, Plus, Check, Info } from 'lucide-react'
import {
  getCategoryColor,
  catLabel,
  formatCOP,
  formatCOPCompact,
  isGasto,
  isIngreso,
  zoneColor,
  PRESUPUESTO_CATS,
  type Categoria,
  type Transaction,
  type BudgetEntry,
} from '@/lib/types'
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
    .slice(0, 8)

  const total = sorted.reduce((s, d) => s + d.value, 0)
  let ang = 0
  return sorted.map(d => {
    const pct = total > 0 ? d.value / total : 0
    const a0 = ang
    const a1 = ang + pct * 360
    ang = a1
    return { ...d, a0, a1, pct } as ChartEntry
  })
}

export default function CategoriesCard({
  mes, transactions, gastosPorCategoria, ingresos, activeFilter, onFilterChange, onBudgetsChange, onSaved,
}: Props) {
  const [draftMap, setDraftMap] = useState<DraftMap>({})
  const [editing, setEditing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<View>('presupuesto')

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

  useEffect(() => { loadBudgets() }, [loadBudgets])

  // ── Vista Presupuesto ──────────────────────────────────────────────────────
  const withBudget = Object.keys(budgets).filter(cat => (budgets[cat] ?? 0) > 0)
  const budgetOnly = PRESUPUESTO_CATS.filter(
    cat => !(budgets[cat] ?? 0) && (gastosPorCategoria[cat] ?? 0) > 0
  )
  const extraGastos = (['TRANSFERENCIA'] as Categoria[]).filter(
    cat => (gastosPorCategoria[cat] ?? 0) > 0
  )
  const sinPresupuesto = [...budgetOnly, ...extraGastos]
    .sort((a, b) => (gastosPorCategoria[b] ?? 0) - (gastosPorCategoria[a] ?? 0))

  const withBudgetSorted = [...withBudget].sort((a, b) => {
    const pctA = (gastosPorCategoria[a] ?? 0) / (budgets[a] ?? 1)
    const pctB = (gastosPorCategoria[b] ?? 0) / (budgets[b] ?? 1)
    return pctB - pctA
  })

  const maxGasto = Math.max(1, ...sinPresupuesto.map(cat => gastosPorCategoria[cat] ?? 0))
  const hasBudgetContent = withBudget.length > 0 || sinPresupuesto.length > 0

  // ── Vista Participación ────────────────────────────────────────────────────
  const chartData = useMemo(() => buildChartData(transactions), [transactions])
  const chartTotal = chartData.reduce((s, d) => s + d.value, 0)
  const S = 168, cx = S / 2, cy = S / 2, oR = 70, iR = 46
  const catActive = activeFilter !== 'TODOS' && !activeFilter.startsWith('BANCO:')
  const selEntry = catActive ? chartData.find(d => d.categoria === (activeFilter as Categoria)) : null
  const hasChartContent = chartData.length > 0

  const hasAnyContent = hasBudgetContent || hasChartContent

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
        ingresos={ingresos}
        initialBudgets={draftMap}
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
        onSaved={() => {
          onSaved()
          setEditing(false)
          loadBudgets()
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
              Participación
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

      {/* Vista Presupuesto */}
      {hasAnyContent && view === 'presupuesto' && (
        <>
          {withBudgetSorted.map((cat, i) => {
            const gasto  = gastosPorCategoria[cat] ?? 0
            const limite = budgets[cat] ?? 0
            const pct    = limite > 0 ? (gasto / limite) * 100 : 0
            const color  = zoneColor(pct)
            return (
              <div key={cat} className={`${styles.row} ${i < withBudgetSorted.length - 1 ? styles.rowBorder : ''}`}>
                <div className={styles.rowMeta}>
                  <span className={styles.dot} style={{ '--dot-color': getCategoryColor(cat) } as React.CSSProperties} />
                  <span className={styles.catName}>{catLabel(cat)}</span>
                  <span className={styles.amounts}>
                    <span className={styles.spent}>{formatCOP(gasto)}</span>
                    <span className={styles.limit}> / {formatCOP(limite)}</span>
                  </span>
                  <span className={styles.pct} style={{ '--pct-color': color } as React.CSSProperties}>
                    {pct >= 110 ? `+${Math.round(pct - 100)}%` : pct >= 100 ? <Check size={13} strokeWidth={2.5} /> : `${Math.round(pct)}%`}
                  </span>
                </div>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ '--bar-w': `${Math.min(pct, 100)}%`, '--bar-color': color } as React.CSSProperties}
                  />
                </div>
              </div>
            )
          })}

          {sinPresupuesto.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Sin presupuesto</p>
            </div>
          )}
          {sinPresupuesto.map((cat, i) => {
            const gasto = gastosPorCategoria[cat] ?? 0
            const pct   = (gasto / maxGasto) * 100
            const canDefine = cat !== 'TRANSFERENCIA'
            return (
              <div key={cat} className={`${styles.row} ${i < sinPresupuesto.length - 1 ? styles.rowBorder : ''}`}>
                <div className={styles.rowMeta}>
                  <span className={styles.dot} style={{ '--dot-color': getCategoryColor(cat) } as React.CSSProperties} />
                  <span className={styles.catName}>{catLabel(cat)}</span>
                  {cat === 'TRANSFERENCIA' && (
                    <span
                      className={styles.infoIcon}
                      title="Transferencias, considera recategorizarlas en la lista de movimientos"
                    >
                      <Info size={10} />
                    </span>
                  )}
                  <span className={styles.amountOnly}>{formatCOP(gasto)}</span>
                  {canDefine ? (
                    <button onClick={() => setEditing(true)} className={styles.defineBtn}>
                      <Plus size={11} strokeWidth={2.5} />
                      Definir
                    </button>
                  ) : (
                    <span className={styles.dash}>—</span>
                  )}
                </div>
                <div className={styles.barTrack}>
                  <div className={styles.barFillGray} style={{ '--bar-w': `${pct}%` } as React.CSSProperties} />
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Vista Participación */}
      {hasAnyContent && view === 'participacion' && (
        hasChartContent ? (
          <div className={styles.body}>
            <div
              className={styles.donutWrap}
              data-testid={TEST_IDS.DASHBOARD_DONUT_CHART}
              role="img"
              aria-label="Gráfico de gastos por categoría"
            >
              <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
                {chartData.map((sl, i) => {
                  const isSel = catActive && sl.categoria === (activeFilter as Categoria)
                  const isDimmed = catActive && sl.categoria !== (activeFilter as Categoria)
                  const isSelected = sl.categoria === activeFilter
                  return (
                    <path
                      key={i}
                      d={donutArc(cx, cy, isSel ? oR + 7 : oR, iR, sl.a0, sl.a1)}
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
                      onClick={() => onFilterChange(isSelected ? 'TODOS' : sl.categoria)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onFilterChange(isSelected ? 'TODOS' : sl.categoria)
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

            <div className={styles.legend}>
              {chartData.map((entry, i) => {
                const LegendIcon = getCategoryIcon(entry.categoria)
                return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  className={styles.legendRow}
                  aria-pressed={entry.categoria === activeFilter}
                  aria-label={`${entry.name}: ${Math.round(entry.pct * 100)}%`}
                  onClick={() => onFilterChange(entry.categoria === activeFilter ? 'TODOS' : entry.categoria)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onFilterChange(entry.categoria === activeFilter ? 'TODOS' : entry.categoria)
                    }
                  }}
                >
                  <div className={styles.legendHeader}>
                    <div className={styles.legendNameGroup}>
                      <div className={styles.legendIconDot} style={{ background: `${entry.fill}26`, color: entry.fill }}>
                        <LegendIcon size={10} />
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
        ) : (
          <p className={styles.emptyInline}>Sin datos de participación este mes</p>
        )
      )}
    </div>
  )
}
