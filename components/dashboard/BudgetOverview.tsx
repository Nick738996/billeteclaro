'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Info } from 'lucide-react'
import {
  CATEGORIA_COLORS,
  PRESUPUESTO_CATS,
  formatCOPCompact,
  catLabel,
  type Categoria,
  type BudgetEntry,
} from '@/lib/types'
import BudgetManager from './BudgetManager'

type DraftMap = Record<string, BudgetEntry>

interface Props {
  mes: string
  gastosPorCategoria: Record<string, number>
  ingresos: number
  onBudgetsChange: (totals: Record<string, number>) => void
  onSaved: () => void
}

function urgencyRank(pct: number): number {
  if (pct >= 100) return 0
  if (pct >= 80)  return 1
  return 2
}

function barColor(pct: number): string {
  if (pct >= 100) return 'var(--red)'
  if (pct >= 80)  return 'var(--yellow)'
  return 'var(--green)'
}

function badgeColor(pct: number): string {
  if (pct === 0)   return 'var(--text-subtle)'
  if (pct >= 100)  return 'var(--red)'
  if (pct >= 80)   return 'var(--yellow)'
  return 'var(--green)'
}

export default function BudgetOverview({ mes, gastosPorCategoria, ingresos, onBudgetsChange, onSaved }: Props) {
  const [draftMap, setDraftMap] = useState<DraftMap>({})
  const [editing, setEditing] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Totals derivados del DraftMap completo
  const budgets: Record<string, number> = Object.fromEntries(
    Object.entries(draftMap).map(([k, v]) => [k, v.monto])
  )

  const loadBudgets = useCallback(() => {
    fetch(`/api/budgets?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        const raw: DraftMap = d.budgets ?? {}
        setDraftMap(raw)
        const totals = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.monto]))
        onBudgetsChange(totals)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  useEffect(() => { loadBudgets() }, [loadBudgets])

  // Categorías con presupuesto (predefinidas + custom)
  const withBudget = Object.keys(budgets).filter(cat => (budgets[cat] ?? 0) > 0)
  const budgetOnly = PRESUPUESTO_CATS.filter(
    cat => !(budgets[cat] ?? 0) && (gastosPorCategoria[cat] ?? 0) > 0
  )
  // También incluir TRANSFERENCIA si tiene gasto pero no es presupuestable
  const extraGastos = (['TRANSFERENCIA'] as Categoria[]).filter(
    cat => (gastosPorCategoria[cat] ?? 0) > 0
  )
  const noBudget = [...budgetOnly]
    .sort((a, b) => (gastosPorCategoria[b] ?? 0) - (gastosPorCategoria[a] ?? 0))
  const sinCategoria = [...extraGastos]
    .sort((a, b) => (gastosPorCategoria[b] ?? 0) - (gastosPorCategoria[a] ?? 0))

  // Ordenar: excedidas → cerca del límite → OK, y dentro de cada grupo por % desc
  const sorted = [...withBudget].sort((a, b) => {
    const pctA = ((gastosPorCategoria[a] ?? 0) / (budgets[a] ?? 1)) * 100
    const pctB = ((gastosPorCategoria[b] ?? 0) / (budgets[b] ?? 1)) * 100
    const rankDiff = urgencyRank(pctA) - urgencyRank(pctB)
    return rankDiff !== 0 ? rankDiff : pctB - pctA
  })

  if (!loaded) return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="skeleton" style={{ height: 11, width: 120, marginBottom: 16, borderRadius: 4 }} />
      {[80, 60, 90].map((w, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div className="skeleton" style={{ height: 10, width: `${w}%`, marginBottom: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 4, borderRadius: 99 }} />
        </div>
      ))}
    </div>
  )

  // Máximo gasto entre todas las categorías mostradas — para escalar las barras sin presupuesto
  const maxGasto = Math.max(
    1,
    ...sorted.map(cat => gastosPorCategoria[cat] ?? 0),
    ...noBudget.map(cat => gastosPorCategoria[cat] ?? 0),
    ...sinCategoria.map(cat => gastosPorCategoria[cat] ?? 0),
  )

  const hasContent = sorted.length > 0 || noBudget.length > 0 || sinCategoria.length > 0

  if (editing) {
    return (
      <BudgetManager
        mes={mes}
        gastosPorCategoria={gastosPorCategoria}
        ingresos={ingresos}
        initialBudgets={draftMap}
        onBudgetsChange={newTotals => {
          setDraftMap(prev => {
            const next: DraftMap = {}
            for (const [k, v] of Object.entries(newTotals)) {
              next[k] = prev[k] ? { ...prev[k], monto: v } : { monto: v, subcategorias: [] }
            }
            return next
          })
          onBudgetsChange(newTotals)
        }}
        onSaved={() => {
          onSaved()
          setEditing(false)
          loadBudgets()
        }}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <div>
      {/* Category bars card */}
      <div className="card" style={{ overflow: 'hidden' }}>

        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '14px 16px 10px', borderBottom: hasContent ? '1px solid var(--border-soft)' : 'none' }}
        >
          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
            Presupuesto
          </p>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)', fontWeight: 500, padding: '2px 0',
            }}
          >
            <Pencil size={11} />
            Editar
          </button>
        </div>

        {/* Empty state */}
        {!hasContent && (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
              Sin transacciones este mes
            </p>
            <button
              onClick={() => setEditing(true)}
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 500,
                color: 'var(--green)', background: 'var(--green-soft)',
                border: 'none', borderRadius: 'var(--radius-sm)',
                padding: '6px 14px', cursor: 'pointer',
              }}
            >
              Configurar presupuesto
            </button>
          </div>
        )}

        {/* Rows with budget */}
        {sorted.map((cat, i) => {
          const gasto  = gastosPorCategoria[cat] ?? 0
          const limite = budgets[cat] ?? 0
          const pct    = limite > 0 ? (gasto / limite) * 100 : 0
          const color  = barColor(pct)
          const dot    = (CATEGORIA_COLORS as Record<string, string>)[cat] ?? '#94a3b8'

          return (
            <div
              key={cat}
              style={{
                padding: '11px 16px',
                borderBottom: i < sorted.length - 1 || noBudget.length > 0 ? '1px solid var(--border-soft)' : 'none',
              }}
            >
              {/* Name + amounts */}
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <span className="flex-1 truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', fontWeight: 600 }}>
                  {catLabel(cat)}
                </span>
                <span className="tabular-nums flex-shrink-0" style={{ fontSize: 'var(--text-xs)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{formatCOPCompact(gasto)}</span>
                  <span style={{ color: 'var(--text-subtle)' }}> / {formatCOPCompact(limite)}</span>
                </span>
                <span
                  className="tabular-nums flex-shrink-0"
                  style={{ fontSize: 12, fontWeight: 700, color: badgeColor(pct), minWidth: 40, textAlign: 'right' }}
                >
                  {pct > 100 ? `+${Math.round(pct - 100)}%` : `${Math.round(pct)}%`}
                </span>
              </div>

              {/* Bar */}
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(pct, 100)}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 99,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )
        })}

        {/* Sin presupuesto — separador */}
        {noBudget.length > 0 && (
          <div className="flex items-center gap-3" style={{ padding: '10px 16px 6px', borderTop: '1px solid var(--border-soft)' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
            <p style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              Sin presupuesto
            </p>
            <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
          </div>
        )}
        {noBudget.map((cat, i) => {
          const gasto = gastosPorCategoria[cat] ?? 0
          const pct   = (gasto / maxGasto) * 100
          return (
            <div key={cat} style={{ padding: '13px 16px 25px', borderBottom: i < noBudget.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: CATEGORIA_COLORS[cat], flexShrink: 0 }} />
                <span className="flex-1 truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', fontWeight: 600 }}>
                  {catLabel(cat)}
                </span>
                <span className="tabular-nums flex-shrink-0" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {formatCOPCompact(gasto)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-subtle)', minWidth: 40, textAlign: 'right' }}>—</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: CATEGORIA_COLORS[cat], opacity: 0.5, borderRadius: 99, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )
        })}

        {/* Sin categoría — TRANSFERENCIA */}
        {sinCategoria.length > 0 && (
          <div className="flex items-center gap-3" style={{ padding: '10px 16px 6px', borderTop: '1px solid var(--border-soft)' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
            <div className="flex items-center gap-1">
              <p style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                Sin categoría
              </p>
              <span title="Transferencias — considera recategorizarlas en la lista de movimientos">
                <Info size={10} style={{ color: 'var(--text-subtle)', cursor: 'help', flexShrink: 0 }} />
              </span>
            </div>
            <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
          </div>
        )}
        {sinCategoria.map((cat, i) => {
          const gasto = gastosPorCategoria[cat] ?? 0
          const pct   = (gasto / maxGasto) * 100
          return (
            <div key={cat} style={{ padding: '10px 16px', borderBottom: i < sinCategoria.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: CATEGORIA_COLORS[cat], flexShrink: 0 }} />
                <span className="flex-1 truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', fontWeight: 600 }}>
                  {catLabel(cat)}
                </span>
                <span className="tabular-nums flex-shrink-0" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {formatCOPCompact(gasto)}
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--yellow)', borderRadius: 99, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
