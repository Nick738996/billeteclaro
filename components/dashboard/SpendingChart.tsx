'use client'

import { useMemo } from 'react'
import {
  CATEGORIA_COLORS,
  CATEGORIA_LABELS,
  getCategoryColor,
  catLabel,
  formatCOPCompact,
  isGasto,
  isIngreso,
  type Categoria,
  type Transaction,
} from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import styles from './SpendingChart.module.css'

// MEJORA ②: donut interactivo (toca un slice → filtra la lista)
//           + barras proporcionales con % en la leyenda
// Antes: PieChart 144×144 de Recharts, leyenda solo dot+nombre+monto
// Después: SVG propio 168×168, slices clickeables, barras proporcionales

interface Props {
  transactions: Transaction[]
  activeFilter: string
  onFilterChange: (key: string) => void
}

// ── SVG helpers ─────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function donutArc(
  cx: number, cy: number,
  oR: number, iR: number,
  a0: number, a1: number,
): string {
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

// ── Component ────────────────────────────────────────────────────────────────

export default function SpendingChart({ transactions, activeFilter, onFilterChange }: Props) {
  const data = useMemo(() => buildChartData(transactions), [transactions])
  const total = data.reduce((s, d) => s + d.value, 0)
  const S = 168, cx = S / 2, cy = S / 2, oR = 70, iR = 46

  const catActive = activeFilter !== 'TODOS' && !activeFilter.startsWith('BANCO:')
  const selEntry  = catActive ? data.find(d => d.categoria === (activeFilter as Categoria)) : null

  if (data.length === 0) {
    return (
      <div className={styles.containerEmpty}>
        <h2 className={styles.heading}>
          Gastos por categoría
        </h2>
        <p className={styles.emptyText}>
          Sin datos este mes. Sincroniza para ver tus gastos.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>
        Gastos por categoría
      </h2>

      <div className={styles.body}>

        {/* Donut interactivo */}
        <div
          className={styles.donutWrap}
          data-testid={TEST_IDS.DASHBOARD_DONUT_CHART}
          role="img"
          aria-label="Gráfico de gastos por categoría"
        >
          <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
            {data.map((sl, i) => {
              const isSel    = catActive && sl.categoria === (activeFilter as Categoria)
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
                  aria-label={`${sl.name}: ${Math.round(sl.pct * 100)}%${isSelected ? ' — activo, presiona para limpiar filtro' : ' — presiona para filtrar'}`}
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

          {/* Centro: total o categoría seleccionada. Toca para limpiar filtro. */}
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
              {selEntry ? formatCOPCompact(selEntry.value) : formatCOPCompact(total)}
            </span>
          </div>
        </div>

        {/* Leyenda con barras proporcionales */}
        <div className={styles.legend}>
          {data.map((entry, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              className={styles.legendRow}
              aria-pressed={entry.categoria === activeFilter}
              aria-label={`${entry.name}: ${Math.round(entry.pct * 100)}%`}
              onClick={() => onFilterChange(
                entry.categoria === activeFilter ? 'TODOS' : entry.categoria
              )}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onFilterChange(entry.categoria === activeFilter ? 'TODOS' : entry.categoria)
                }
              }}
            >
              <div className={styles.legendHeader}>
                <div className={styles.legendNameGroup}>
                  <div
                    className={styles.legendDot}
                    style={{ '--clr': entry.fill } as React.CSSProperties}
                  />
                  <span className={styles.legendName}>
                    {entry.name}
                  </span>
                </div>
                <span className={styles.legendPct}>
                  {Math.round(entry.pct * 100)}%
                </span>
              </div>
              {/* Barra proporcional */}
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ '--w': `${entry.pct * 100}%`, '--clr': entry.fill } as React.CSSProperties}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
