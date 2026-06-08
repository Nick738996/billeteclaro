'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { CATEGORIA_COLORS, CATEGORIA_LABELS, formatCOP, type Categoria, type Transaction } from '@/lib/types'

interface Props {
  transactions: Transaction[]
}

interface ChartEntry {
  name: string
  value: number
  fill: string
  categoria: Categoria
}

const TIPOS_GASTO = new Set(['COMPRA', 'PAGO_SERVICIO', 'RETIRO', 'TRANSFERENCIA_ENVIADA', 'ABONO_DEUDA'])

function buildChartData(transactions: Transaction[]): ChartEntry[] {
  const totals: Partial<Record<Categoria, number>> = {}

  for (const t of transactions) {
    // Solo gastos reales — excluye ingresos y transferencias recibidas
    if (!TIPOS_GASTO.has(t.tipo)) continue
    // Excluye categorías que no son gastos de consumo
    if (t.categoria === 'INGRESO') continue
    totals[t.categoria] = (totals[t.categoria] ?? 0) + t.monto
  }

  return Object.entries(totals)
    .filter(([, value]) => value! > 0)
    .map(([cat, value]) => ({
      name: CATEGORIA_LABELS[cat as Categoria] ?? cat,
      value: value!,
      fill: CATEGORIA_COLORS[cat as Categoria] ?? '#94a3b8',
      categoria: cat as Categoria,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartEntry }>
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const entry = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-slate-800">{entry.name}</p>
      <p className="text-slate-600">{formatCOP(entry.value)}</p>
    </div>
  )
}

export default function SpendingChart({ transactions }: Props) {
  const data = useMemo(() => buildChartData(transactions), [transactions])

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Gastos por categoría</h2>
        <p className="text-slate-400 text-sm text-center py-6">
          Sin datos este mes. Sincroniza para ver tus gastos.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Gastos por categoría</h2>

      <div className="flex gap-4 items-center">
        <div className="w-36 h-36 flex-shrink-0">
          <PieChart width={144} height={144}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={38}
              outerRadius={64}
              paddingAngle={2}
              dataKey="value"
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell key={entry.categoria} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </div>

        <div className="flex-1 space-y-2 overflow-hidden">
          {data.map((entry) => (
            <div key={entry.categoria} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.fill }}
              />
              <span className="text-xs text-slate-600 truncate flex-1">{entry.name}</span>
              <span className="text-xs font-medium text-slate-800 tabular-nums flex-shrink-0">
                {formatCOP(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
