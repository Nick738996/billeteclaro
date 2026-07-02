'use client'

import { getDaysInMonth, parseISO } from 'date-fns'
import { BarChart2 } from 'lucide-react'
import { formatCOPCompact } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import styles from './MonthHero.module.css'

interface Props {
  gastos: number
  ingresos: number
  ahorros: number
  transacciones: number
  mes: string
  showChart: boolean
  onChartToggle: () => void
}

export default function MonthHero({ gastos, ingresos, ahorros: _ahorros, transacciones, mes, showChart, onChartToggle }: Props) {
  const ref = parseISO(`${mes}-01`)
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === ref.getFullYear() && today.getMonth() === ref.getMonth()
  const diasRestantes = isCurrentMonth ? getDaysInMonth(ref) - today.getDate() : 0

  const hasIncome = ingresos > 0
  const pct        = hasIncome ? (gastos / ingresos) * 100 : 0
  const over       = hasIncome && gastos > ingresos
  const disponible = ingresos - gastos

  // Solo los valores computados dinámicamente permanecen inline
  const barColor = over ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)'
  const pctColor = over ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)'

  return (
    <div data-testid={TEST_IDS.DASHBOARD_MONTH_PROGRESS} className={styles.hero}>

      {/* Amount row */}
      <div className={styles.amountRow} style={{ marginBottom: hasIncome ? 12 : 8 }}>
        <div>
          <p className={styles.label}>Gastado este mes</p>
          <div className="flex items-baseline gap-2">
            <span className={`tabular-nums ${styles.amount}`}>
              {formatCOPCompact(gastos)}
            </span>
            {hasIncome && (
              <span className={styles.incomeSuffix}>
                de {formatCOPCompact(ingresos)}
              </span>
            )}
          </div>
        </div>

        {hasIncome && (
          <span className={`tabular-nums ${styles.badge}`} style={{ color: pctColor }}>
            {Math.round(pct)}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      {hasIncome && (
        <div className={styles.barTrack}>
          <div
            className={styles.barFill}
            style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
          />
        </div>
      )}

      {/* Subtext + chart toggle */}
      <div className={styles.footer}>
        {hasIncome && (
          <p className={over ? styles.disponibleOver : styles.disponibleOk}>
            {over
              ? `${formatCOPCompact(Math.abs(disponible))} sobre el límite`
              : `${formatCOPCompact(disponible)} disponibles`}
          </p>
        )}
        {isCurrentMonth && diasRestantes > 0 && (
          <p className={styles.meta}>{diasRestantes}d restantes</p>
        )}
        <p className={styles.meta}>{transacciones} mov.</p>
        <button
          onClick={onChartToggle}
          aria-label={showChart ? 'Ocultar gráfico' : 'Ver gráfico por categoría'}
          className={`${styles.chartBtn} ${showChart ? styles.chartBtnActive : ''}`}
        >
          <BarChart2 size={14} />
        </button>
      </div>
    </div>
  )
}
