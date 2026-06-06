import { formatCOP, type MonthlyStats } from '@/lib/types'

interface Props {
  stats: MonthlyStats
}

export default function StatsCards({ stats }: Props) {
  const isPositive = stats.balance >= 0

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Gastos</p>
        <p className="text-lg font-bold text-rose-600 mt-1 tabular-nums">
          {formatCOP(stats.gastos)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {stats.transacciones} mov.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Ingresos</p>
        <p className="text-lg font-bold text-brand-600 mt-1 tabular-nums">
          {formatCOP(stats.ingresos)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">este mes</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Balance</p>
        <p
          className={`text-lg font-bold mt-1 tabular-nums ${
            isPositive ? 'text-slate-900' : 'text-rose-600'
          }`}
        >
          {formatCOP(stats.balance)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {isPositive ? 'superávit' : 'déficit'}
        </p>
      </div>
    </div>
  )
}
