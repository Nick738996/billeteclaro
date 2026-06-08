import { formatCOPCompact, type MonthlyStats } from '@/lib/types'

interface Props {
  stats: MonthlyStats
}

export default function StatsCards({ stats }: Props) {
  const isPositive = stats.balance >= 0

  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        {
          label: 'Gastos',
          value: formatCOPCompact(stats.gastos),
          color: 'var(--red)',
          sub: `${stats.transacciones} mov.`,
        },
        {
          label: 'Ingresos',
          value: formatCOPCompact(stats.ingresos),
          color: 'var(--green)',
          sub: 'este mes',
        },
        {
          label: 'Balance',
          value: formatCOPCompact(stats.balance),
          color: isPositive ? 'var(--text)' : 'var(--red)',
          sub: isPositive ? 'superávit' : 'déficit',
        },
      ].map(({ label, value, color, sub }) => (
        <div
          key={label}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 16,
          }}
        >
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {label}
          </p>
          <p style={{ fontSize: 'var(--text-xl)', color, fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            {sub}
          </p>
        </div>
      ))}
    </div>
  )
}
