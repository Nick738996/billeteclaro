'use client'

import { getDaysInMonth, parseISO } from 'date-fns'
import { BarChart2 } from 'lucide-react'
import { formatCOPCompact } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

interface Props {
  gastos: number
  ingresos: number
  ahorros: number
  transacciones: number
  mes: string
  showChart: boolean
  onChartToggle: () => void
}

export default function MonthHero({ gastos, ingresos, ahorros, transacciones, mes, showChart, onChartToggle }: Props) {
  const ref = parseISO(`${mes}-01`)
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === ref.getFullYear() && today.getMonth() === ref.getMonth()
  const diasRestantes = isCurrentMonth ? getDaysInMonth(ref) - today.getDate() : 0

  const hasIncome = ingresos > 0
  const pct        = hasIncome ? (gastos / ingresos) * 100 : 0
  const over       = hasIncome && gastos > ingresos
  const disponible = ingresos - gastos

  const barColor = over ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)'
  const pctBadgeBg = over ? 'var(--red-soft)' : pct >= 80 ? 'var(--yellow-soft)' : 'var(--green-soft)'

  return (
    <div data-testid={TEST_IDS.DASHBOARD_MONTH_PROGRESS} style={{ padding: '8px 0 4px' }}>

      {/* Amount row */}
      <div className="flex items-end justify-between" style={{ marginBottom: hasIncome ? 12 : 8 }}>
        <div>
          <p style={{
            fontSize: 'var(--text-xs)', fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.07em', textTransform: 'uppercase',
            marginBottom: 5,
          }}>
            Gastado este mes
          </p>
          <div className="flex items-baseline gap-2">
            <span
              className="tabular-nums"
              style={{ fontSize: 'var(--text-4xl)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}
            >
              {formatCOPCompact(gastos)}
            </span>
            {hasIncome && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                de {formatCOPCompact(ingresos)}
              </span>
            )}
          </div>
        </div>

        {hasIncome && (
          <span
            className="tabular-nums"
            style={{
              fontSize: 'var(--text-sm)', fontWeight: 700,
              color: barColor, background: pctBadgeBg,
              padding: '5px 11px', borderRadius: 'var(--radius-sm)',
              marginBottom: 2,
            }}
          >
            {Math.round(pct)}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      {hasIncome && (
        <div style={{ height: 5, background: 'var(--border)', borderRadius: 99, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(pct, 100)}%`,
            height: '100%',
            background: barColor,
            borderRadius: 99,
            transition: 'width 0.4s ease',
          }} />
        </div>
      )}

      {/* Subtext + chart toggle */}
      <div className="flex items-center gap-4">
        {hasIncome && (
          <p style={{ fontSize: 'var(--text-xs)', color: over ? 'var(--red)' : 'var(--text-muted)' }}>
            {over
              ? `${formatCOPCompact(Math.abs(disponible))} sobre el límite`
              : `${formatCOPCompact(disponible)} disponibles`}
          </p>
        )}
        {isCurrentMonth && diasRestantes > 0 && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
            {diasRestantes}d restantes
          </p>
        )}
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
          {transacciones} mov.
        </p>
        <button
          onClick={onChartToggle}
          aria-label={showChart ? 'Ocultar gráfico' : 'Ver gráfico por categoría'}
          className="flex items-center justify-center transition-opacity hover:opacity-70 ml-auto"
          style={{
            background: showChart ? 'var(--surface-2)' : 'none',
            border: showChart ? '1px solid var(--border)' : 'none',
            borderRadius: 'var(--radius-badge)',
            color: showChart ? 'var(--text)' : 'var(--text-subtle)',
            cursor: 'pointer',
            padding: '3px 6px',
          }}
        >
          <BarChart2 size={14} />
        </button>
      </div>
    </div>
  )
}
