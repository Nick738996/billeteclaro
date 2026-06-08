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
    if (!TIPOS_GASTO.has(t.tipo)) continue
    if (t.categoria === 'INGRESO') continue
    totals[t.categoria] = (totals[t.categoria] ?? 0) + t.monto
  }

  return Object.entries(totals)
    .filter(([, value]) => value! > 0)
    .map(([cat, value]) => ({
      name: CATEGORIA_LABELS[cat as Categoria] ?? cat,
      value: value!,
      fill: CATEGORIA_COLORS[cat as Categoria] ?? '#606060',
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
    <div
      className="rounded-[var(--radius-md)] px-3 py-2"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <p className="font-medium" style={{ color: 'var(--text)' }}>{entry.name}</p>
      <p style={{ color: 'var(--text-muted)' }}>{formatCOP(entry.value)}</p>
    </div>
  )
}

export default function SpendingChart({ transactions }: Props) {
  const data = useMemo(() => buildChartData(transactions), [transactions])

  if (data.length === 0) {
    return (
      <div
        className="rounded-[var(--radius-lg)] p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2
          className="font-medium mb-4"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}
        >
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
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <h2
        className="font-medium mb-3"
        style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}
      >
        Gastos por categoría
      </h2>

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

        <div className="flex-1 space-y-2.5 overflow-hidden">
          {data.map((entry) => (
            <div key={entry.categoria} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.fill }}
              />
              <span
                className="truncate flex-1"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
              >
                {entry.name}
              </span>
              <span
                className="font-medium tabular-nums flex-shrink-0"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--text)' }}
              >
                {formatCOP(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
