'use client'

import { getDaysInMonth, parseISO } from 'date-fns'
import { formatCOPCompact } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import styles from './MonthHero.module.css'

interface Props {
  gastos: number
  ingresos: number
  transacciones: number
  mes: string
  budgetTotal: number
}

/** Mensaje breve y honesto del pulso del mes — solo con datos reales, nunca inventa positividad */
function monthPulse(pctTiempo: number, pctPresupuesto: number | null): { texto: string; color: string } | null {
  if (pctPresupuesto === null) return null // sin presupuesto configurado, no hay base para opinar

  if (pctPresupuesto >= 100) {
    return { texto: 'Ya llegaste al 100% del presupuesto', color: 'var(--red)' }
  }
  if (pctPresupuesto - pctTiempo >= 15) {
    return { texto: 'Gastando más rápido que el tiempo del mes', color: 'var(--yellow)' }
  }
  if (pctTiempo < 70 && pctPresupuesto < 70) {
    return { texto: 'Vas bien este mes', color: 'var(--green)' }
  }
  return { texto: 'Vas al ritmo esperado este mes', color: 'var(--text-muted)' }
}

export default function MonthHero({ gastos, ingresos, transacciones, mes, budgetTotal }: Props) {
  const ref = parseISO(`${mes}-01`)
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === ref.getFullYear() && today.getMonth() === ref.getMonth()
  const diasEnMes    = getDaysInMonth(ref)
  const diasRestantes = isCurrentMonth ? diasEnMes - today.getDate() : 0

  const hasIncome = ingresos > 0
  const pct        = hasIncome ? (gastos / ingresos) * 100 : 0
  const over       = hasIncome && gastos > ingresos
  const disponible = ingresos - gastos

  // Solo los valores computados dinámicamente permanecen inline
  const barColor = over ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)'
  const pctColor = over ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)'

  const pctTiempo       = (today.getDate() / diasEnMes) * 100
  const pctPresupuesto  = budgetTotal > 0 ? (gastos / budgetTotal) * 100 : null
  const pulse = isCurrentMonth ? monthPulse(pctTiempo, pctPresupuesto) : null

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

      {pulse && (
        <p className={styles.pulse} style={{ color: pulse.color }}>{pulse.texto}</p>
      )}

      {/* Subtext */}
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
      </div>
    </div>
  )
}
