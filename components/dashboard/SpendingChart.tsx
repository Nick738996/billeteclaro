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
      <div
        className="rounded-[var(--radius-lg)] p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="font-medium mb-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
          Gastos por categoría
        </h2>
        <p className="text-center py-6" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Sin datos este mes. Sincroniza para ver tus gastos.
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-[var(--radius-lg)] p-4"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
      }}
    >
      <h2 className="font-medium mb-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
        Gastos por categoría
      </h2>

      <div className="flex gap-4 items-center">

        {/* Donut interactivo */}
        <div
          className="flex-shrink-0 relative"
          style={{ width: S, height: S }}
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
                  className="cursor-pointer transition-opacity duration-150"
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
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ gap: 2, cursor: catActive ? 'pointer' : 'default' }}
            onClick={() => catActive && onFilterChange('TODOS')}
            role={catActive ? 'button' : undefined}
            aria-label={catActive ? 'Limpiar filtro de categoría' : undefined}
            tabIndex={catActive ? 0 : undefined}
            onKeyDown={catActive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilterChange('TODOS') } } : undefined}
          >
            <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              {selEntry ? selEntry.name : 'total'}
            </span>
            <span
              className="tabular-nums font-bold"
              style={{ fontSize: 16, color: selEntry ? selEntry.fill : 'var(--text)' }}
            >
              {selEntry ? formatCOPCompact(selEntry.value) : formatCOPCompact(total)}
            </span>
            {catActive && (
              <span style={{ fontSize: 9, color: 'var(--text-subtle)', marginTop: 2 }}>
                toca para limpiar
              </span>
            )}
          </div>
        </div>

        {/* Leyenda con barras proporcionales */}
        <div className="flex-1 flex flex-col gap-2.5 overflow-hidden">
          {data.map((entry, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              className="cursor-pointer"
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
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entry.fill }}
                  />
                  <span className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--text)' }}>
                    {entry.name}
                  </span>
                </div>
                <span
                  className="tabular-nums flex-shrink-0 ml-2"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
                >
                  {Math.round(entry.pct * 100)}%
                </span>
              </div>
              {/* Barra proporcional */}
              <div className="rounded-full" style={{ height: 3, background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${entry.pct * 100}%`, background: entry.fill }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
