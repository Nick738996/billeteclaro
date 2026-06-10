import { formatCOPCompact, type MonthlyStats } from '@/lib/types'

interface Props {
  stats: MonthlyStats
}

// MEJORA ①: balance como hero card + gastos/ingresos en row secundario
// Antes: grid-cols-3 con igual peso (los 3 datos compiten visualmente)
// Después: balance ocupa full-width con número grande en verde/rojo

export default function StatsCards({ stats }: Props) {
  const { gastos, ingresos, balance, transacciones } = stats
  const surplus = balance >= 0
  const bColor  = surplus ? 'var(--green)' : 'var(--red)'
  const bSoft   = surplus ? 'var(--green-soft)' : 'var(--red-soft)'

  const glow = (isIncome: boolean) => ({
    background:           isIncome ? 'var(--green-glow-bg)' : 'var(--red-glow-bg)',
    border:               isIncome ? '1px solid var(--green-glow-border)' : '1px solid var(--red-glow-border)',
    backdropFilter:       'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    borderRadius:         'var(--radius-lg)',
  })

  return (
    <div className="flex flex-col gap-2">

      {/* Balance hero */}
      <div
        style={{
          ...glow(surplus),
          padding: '20px 20px 18px',
        }}
      >
        <p
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Balance neto
        </p>
        <div className="flex items-end justify-between">
          <span
            className="tabular-nums"
            style={{ fontSize: 'var(--text-4xl)', fontWeight: 700, color: bColor, letterSpacing: '-0.03em', lineHeight: 1 }}
          >
            {formatCOPCompact(Math.abs(balance))}
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: bColor,
              background: bSoft,
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 3,
            }}
          >
            {surplus ? 'positivo' : 'negativo'}
          </span>
        </div>
      </div>

      {/* Gastos + Ingresos secundarios */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Gastos',   arrow: '↓', value: formatCOPCompact(gastos),   color: 'var(--red)',   sub: `${transacciones} mov.`,  isIncome: false },
          { label: 'Ingresos', arrow: '↑', value: formatCOPCompact(ingresos), color: 'var(--green)', sub: 'este mes',               isIncome: true  },
        ].map(({ label, arrow, value, color, sub, isIncome }) => (
          <div
            key={label}
            style={{
              ...glow(isIncome),
              padding: '14px 16px',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
            }}
          >
            <p
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {arrow} {label}
            </p>
            <p className="tabular-nums" style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, color, letterSpacing: '-0.02em' }}>
              {value}
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
