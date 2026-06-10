'use client'

import { getDaysInMonth, parseISO } from 'date-fns'
import { formatCOPCompact } from '@/lib/types'

interface Props {
  gastos: number
  ingresos: number
  totalPresupuestado: number
  transacciones: number
  mes: string
}

export default function MonthHero({ gastos, ingresos, totalPresupuestado, transacciones, mes }: Props) {
  const ref = parseISO(`${mes}-01`)
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === ref.getFullYear() && today.getMonth() === ref.getMonth()
  const diasRestantes = isCurrentMonth ? getDaysInMonth(ref) - today.getDate() : 0

  const hasBudget = totalPresupuestado > 0
  const pct       = hasBudget ? (gastos / totalPresupuestado) * 100 : 0
  const over      = hasBudget && gastos > totalPresupuestado
  const disponible = totalPresupuestado - gastos

  const barColor = over ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)'
  const pctBadgeBg = over ? 'var(--red-soft)' : pct >= 80 ? 'var(--yellow-soft)' : 'var(--green-soft)'

  return (
    <div style={{ padding: '8px 0 4px' }}>

      {/* Amount row */}
      <div className="flex items-end justify-between" style={{ marginBottom: hasBudget ? 12 : 8 }}>
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
            {hasBudget && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                de {formatCOPCompact(totalPresupuestado)}
              </span>
            )}
          </div>
        </div>

        {hasBudget && (
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
      {hasBudget && (
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

      {/* Subtext */}
      <div className="flex items-center gap-4">
        {hasBudget && (
          <p style={{ fontSize: 'var(--text-xs)', color: over ? 'var(--red)' : 'var(--text-muted)' }}>
            {over
              ? `${formatCOPCompact(Math.abs(disponible))} sobre el límite`
              : `${formatCOPCompact(disponible)} disponibles`}
          </p>
        )}
        {ingresos > 0 && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
            ↑ {formatCOPCompact(ingresos)} ingresados
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
      </div>
    </div>
  )
}
