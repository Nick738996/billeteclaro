'use client'

import { useState, useEffect, useRef } from 'react'
import { CATEGORIA_LABELS, formatCOP, type Categoria } from '@/lib/types'

const GASTO_CATS: Categoria[] = [
  'HOGAR', 'TRANSPORTE', 'SALIDAS', 'SALUD', 'SUSCRIPCIONES',
  'COMPRAS_ONLINE', 'INVERSION', 'DONACIONES', 'EDUCACION', 'REEMBOLSABLE', 'OTRO',
]

function pctColor(pct: number): string {
  if (pct >= 100) return 'var(--red)'
  if (pct >= 80)  return 'var(--yellow)'
  return 'var(--green)'
}

function pctBg(pct: number): string {
  if (pct >= 100) return 'var(--red-soft)'
  if (pct >= 80)  return 'var(--yellow-soft)'
  return 'var(--green-soft)'
}

interface Props {
  mes: string
  gastosPorCategoria: Record<string, number>
  onBudgetsChange?: (budgets: Record<string, number>) => void
}

export default function BudgetManager({ mes, gastosPorCategoria, onBudgetsChange }: Props) {
  const [budgets, setBudgets]       = useState<Record<string, number>>({})
  const [editing, setEditing]       = useState<string | null>(null)
  const [inputVal, setInputVal]     = useState('')
  const [saving, setSaving]         = useState<string | null>(null)
  const [loaded, setLoaded]         = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/budgets?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        setBudgets(d.budgets ?? {})
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [mes])

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  const startEdit = (cat: string) => {
    setEditing(cat)
    setInputVal(budgets[cat] ? String(Math.round(budgets[cat])) : '')
  }

  const commitEdit = async (cat: string) => {
    const raw = inputVal.replace(/\D/g, '')
    const monto = raw ? parseInt(raw, 10) : 0
    setEditing(null)

    // Optimistic update
    const next = { ...budgets, [cat]: monto }
    if (monto === 0) delete next[cat]
    setBudgets(next)
    onBudgetsChange?.(next)

    setSaving(cat)
    try {
      await fetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes, categoria: cat, monto }),
      })
    } catch {
      // revert on error
      setBudgets(budgets)
    } finally {
      setSaving(null)
    }
  }

  const catsWithActivity = GASTO_CATS.filter(
    cat => (gastosPorCategoria[cat] ?? 0) > 0 || (budgets[cat] ?? 0) > 0
  )
  const catsEmpty = GASTO_CATS.filter(
    cat => (gastosPorCategoria[cat] ?? 0) === 0 && (budgets[cat] ?? 0) === 0
  )

  if (!loaded) {
    return (
      <div style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
        <div style={{ height: 12, width: 120, background: 'var(--surface-2)', borderRadius: 6 }} />
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 16px 12px' }}>
        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Presupuesto mensual
        </p>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>
          Toca una categoría para configurar el límite
        </p>
      </div>

      <div>
        {catsWithActivity.map(cat => (
          <BudgetRow
            key={cat}
            cat={cat}
            gasto={gastosPorCategoria[cat] ?? 0}
            limite={budgets[cat] ?? 0}
            isEditing={editing === cat}
            isSaving={saving === cat}
            inputVal={inputVal}
            inputRef={editing === cat ? inputRef : undefined}
            onEdit={() => startEdit(cat)}
            onInputChange={setInputVal}
            onCommit={() => commitEdit(cat)}
          />
        ))}

        {catsEmpty.length > 0 && (
          <details>
            <summary style={{
              padding: '10px 16px',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              listStyle: 'none',
              borderTop: catsWithActivity.length > 0 ? '1px solid var(--border-soft)' : 'none',
            }}>
              + {catsEmpty.length} categorías sin actividad este mes
            </summary>
            {catsEmpty.map(cat => (
              <BudgetRow
                key={cat}
                cat={cat}
                gasto={0}
                limite={budgets[cat] ?? 0}
                isEditing={editing === cat}
                isSaving={saving === cat}
                inputVal={inputVal}
                inputRef={editing === cat ? inputRef : undefined}
                onEdit={() => startEdit(cat)}
                onInputChange={setInputVal}
                onCommit={() => commitEdit(cat)}
              />
            ))}
          </details>
        )}
      </div>
    </div>
  )
}

function BudgetRow({
  cat, gasto, limite, isEditing, isSaving, inputVal, inputRef,
  onEdit, onInputChange, onCommit,
}: {
  cat: Categoria
  gasto: number
  limite: number
  isEditing: boolean
  isSaving: boolean
  inputVal: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  onEdit: () => void
  onInputChange: (v: string) => void
  onCommit: () => void
}) {
  const pct    = limite > 0 ? Math.min((gasto / limite) * 100, 100) : 0
  const over   = limite > 0 && gasto > limite
  const color  = limite > 0 ? pctColor((gasto / limite) * 100) : 'var(--text-muted)'
  const bgColor = limite > 0 ? pctBg((gasto / limite) * 100) : 'transparent'

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border-soft)',
        cursor: 'pointer',
      }}
      onClick={!isEditing ? onEdit : undefined}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: limite > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
          {CATEGORIA_LABELS[cat]}
        </span>
        <div className="flex items-center gap-2">
          {isSaving && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>guardando…</span>
          )}
          {isEditing ? (
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>$</span>
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={inputVal}
                onChange={e => onInputChange(e.target.value)}
                onBlur={onCommit}
                onKeyDown={e => { if (e.key === 'Enter') onCommit() }}
                placeholder="0"
                style={{
                  width: 80,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '3px 6px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text)',
                  textAlign: 'right',
                  outline: 'none',
                }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className="tabular-nums"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
              >
                {formatCOP(gasto)}
              </span>
              {limite > 0 && (
                <span
                  className="tabular-nums"
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color,
                    background: bgColor,
                    padding: '2px 7px',
                    borderRadius: 4,
                  }}
                >
                  {over ? `+${Math.round((gasto / limite - 1) * 100)}%` : `${Math.round((gasto / limite) * 100)}%`}
                </span>
              )}
              {limite === 0 && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                  sin límite
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {limite > 0 && !isEditing && (
        <div className="rounded-full" style={{ height: 3, background: 'var(--border)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: color,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
    </div>
  )
}
