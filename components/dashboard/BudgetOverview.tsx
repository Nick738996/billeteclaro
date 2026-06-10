'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, X } from 'lucide-react'
import {
  CATEGORIA_LABELS,
  CATEGORIA_COLORS,
  PRESUPUESTO_CATS,
  formatCOPCompact,
  type Categoria,
  type BudgetEntry,
} from '@/lib/types'
import BudgetManager from './BudgetManager'

type DraftMap = Record<string, BudgetEntry>

interface Props {
  mes: string
  gastosPorCategoria: Record<string, number>
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

export default function BudgetOverview({ mes, gastosPorCategoria, onBudgetsChange, onSaved }: Props) {
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

  // Categorías con presupuesto (o gasto) — solo de PRESUPUESTO_CATS
  const withBudget = PRESUPUESTO_CATS.filter(cat => (budgets[cat] ?? 0) > 0)
  const budgetOnly = PRESUPUESTO_CATS.filter(
    cat => !(budgets[cat] ?? 0) && (gastosPorCategoria[cat] ?? 0) > 0
  )
  // También incluir TRANSFERENCIA si tiene gasto pero no es presupuestable
  const extraGastos = (['TRANSFERENCIA'] as Categoria[]).filter(
    cat => (gastosPorCategoria[cat] ?? 0) > 0
  )
  const noBudget = [...budgetOnly, ...extraGastos]

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

  const hasContent = sorted.length > 0 || noBudget.length > 0

  return (
    <div>
      {/* Category bars card */}
      <div className="card" style={{ overflow: 'hidden' }}>

        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '14px 16px 10px', borderBottom: hasContent ? '1px solid var(--border-soft)' : 'none' }}
        >
          <p style={{
            fontSize: 'var(--text-xs)', fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: '0.07em', textTransform: 'uppercase',
          }}>
            Presupuesto
          </p>
          <button
            onClick={() => setEditing(e => !e)}
            className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: editing ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 'var(--text-xs)', fontWeight: 500, padding: '2px 0',
            }}
          >
            {editing ? <X size={11} /> : <Pencil size={11} />}
            {editing ? 'Cerrar' : 'Editar'}
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
          const over   = pct >= 100
          const color  = barColor(pct)
          const dot    = CATEGORIA_COLORS[cat]

          return (
            <div
              key={cat}
              style={{
                padding: '12px 16px',
                borderBottom: i < sorted.length - 1 || noBudget.length > 0 ? '1px solid var(--border-soft)' : 'none',
              }}
            >
              {/* Name + amounts */}
              <div className="flex items-center gap-2" style={{ marginBottom: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <span className="flex-1 truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', fontWeight: 500 }}>
                  {CATEGORIA_LABELS[cat]}
                </span>
                <span className="tabular-nums flex-shrink-0" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {formatCOPCompact(gasto)} / {formatCOPCompact(limite)}
                </span>
                <span
                  className="tabular-nums flex-shrink-0"
                  style={{
                    fontSize: 'var(--text-xs)', fontWeight: 700,
                    color: color,
                    minWidth: 38, textAlign: 'right',
                  }}
                >
                  {over ? `+${Math.round(pct - 100)}%` : `${Math.round(pct)}%`}
                </span>
              </div>

              {/* Bar */}
              <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
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

        {/* Sin presupuesto — chips dentro de la card */}
        {noBudget.length > 0 && (
          <div style={{ padding: '10px 16px 12px' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginBottom: 8 }}>
              Sin presupuesto
            </p>
            <div className="flex flex-wrap gap-2">
              {noBudget.map(cat => (
                <span
                  key={cat}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-badge)',
                    padding: '3px 9px',
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: CATEGORIA_COLORS[cat], flexShrink: 0 }} />
                  {CATEGORIA_LABELS[cat]} · {formatCOPCompact(gastosPorCategoria[cat] ?? 0)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Budget editor — inline collapse */}
      {editing && (
        <div style={{ marginTop: 8 }}>
          <BudgetManager
            mes={mes}
            gastosPorCategoria={gastosPorCategoria}
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
          />
        </div>
      )}
    </div>
  )
}
