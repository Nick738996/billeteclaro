import { formatCOPCompact, type MonthlyStats } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import styles from './StatsCards.module.css'

interface Props {
  stats: MonthlyStats
}

// MEJORA ①: balance como hero card + gastos/ingresos en row secundario
// Antes: grid-cols-3 con igual peso (los 3 datos compiten visualmente)
// Después: balance ocupa full-width con número grande en verde/rojo

export default function StatsCards({ stats }: Props) {
  const { gastos, ingresos, ahorros, balance, transacciones } = stats
  const surplus = balance >= 0
  const bColor  = surplus ? 'var(--green)' : 'var(--red)'
  const bSoft   = surplus ? 'var(--green-soft)' : 'var(--red-soft)'

  return (
    <div className={styles.wrapper}>

      {/* Balance hero */}
      <div className={`${styles.heroCard} ${surplus ? styles.heroCardPositive : styles.heroCardNegative}`}>
        <p className={styles.heroLabel}>Balance neto</p>
        <div className={styles.heroRow}>
          <span
            className={styles.heroAmount}
            data-testid={TEST_IDS.DASHBOARD_BALANCE_AMOUNT}
            aria-label={`Balance neto: ${surplus ? 'positivo' : 'negativo'} ${formatCOPCompact(Math.abs(balance))}`}
            style={{ '--clr': bColor } as React.CSSProperties}
          >
            {formatCOPCompact(Math.abs(balance))}
          </span>
          <span
            className={styles.heroBadge}
            style={{ '--clr': bColor, '--bg-soft': bSoft } as React.CSSProperties}
          >
            {surplus ? 'positivo' : 'negativo'}
          </span>
        </div>
      </div>

      {/* Gastos + Ingresos secundarios */}
      <div className={styles.secondaryGrid}>
        {[
          { label: 'Gastos',   arrow: '↓', value: formatCOPCompact(gastos),   color: 'var(--red)',    sub: `${transacciones} mov.`, isIncome: false, testId: TEST_IDS.DASHBOARD_GASTOS_AMOUNT },
          { label: 'Ingresos', arrow: '↑', value: formatCOPCompact(ingresos), color: 'var(--green)',  sub: 'este mes',              isIncome: true,  testId: TEST_IDS.DASHBOARD_INGRESOS_AMOUNT },
          { label: 'Ahorrado', arrow: '→', value: ahorros > 0 ? formatCOPCompact(ahorros) : '—', color: ahorros > 0 ? 'var(--blue)' : 'var(--text-subtle)', sub: 'este mes', isIncome: false, testId: '' },
        ].map(({ label, arrow, value, color, sub, isIncome, testId }) => (
          <div
            key={label}
            className={`${styles.secondaryCard} ${isIncome ? styles.secondaryCardIncome : styles.secondaryCardExpense}`}
          >
            <p className={styles.secondaryLabel}>{arrow} {label}</p>
            <p
              className={styles.secondaryValue}
              data-testid={testId}
              style={{ '--val-clr': color } as React.CSSProperties}
            >
              {value}
            </p>
            <p className={styles.secondarySub}>{sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
