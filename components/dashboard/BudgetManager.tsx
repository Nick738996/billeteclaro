'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, RefreshCw, ChevronRight, Plus, Trash2, Copy } from 'lucide-react'
import { CATEGORIA_LABELS, formatCOP, formatCOPCompact, PRESUPUESTO_CATS, type Categoria, type BudgetEntry, type BudgetSubcat } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

function pctColor(pct: number) {
  if (pct >= 100) return 'var(--red)'
  if (pct >= 80)  return 'var(--yellow)'
  return 'var(--green)'
}
function pctBg(pct: number) {
  if (pct >= 100) return 'var(--red-soft)'
  if (pct >= 80)  return 'var(--yellow-soft)'
  return 'var(--green-soft)'
}

type DraftMap = Record<string, BudgetEntry>

interface Props {
  mes: string
  gastosPorCategoria: Record<string, number>
  onBudgetsChange?: (totals: Record<string, number>) => void
  onSaved?: () => void
}

export default function BudgetManager({ mes, gastosPorCategoria, onBudgetsChange, onSaved }: Props) {
  const [saved,    setSaved]    = useState<DraftMap>({})
  const [draft,    setDraft]    = useState<DraftMap>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [savedOk,  setSavedOk]  = useState(false)
  const [loaded,   setLoaded]   = useState(false)
  const [copying,  setCopying]  = useState(false)

  const [yy, mm] = mes.split('-').map(Number)
  const prevMes = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`

  const copyFromPrev = async () => {
    setCopying(true)
    try {
      const res = await fetch(`/api/budgets?mes=${prevMes}`)
      const d = await res.json()
      const b: DraftMap = d.budgets ?? {}
      if (Object.keys(b).length > 0) {
        setDraft(b)
        onBudgetsChange?.(totals(b))
      }
    } finally {
      setCopying(false)
    }
  }

  const normalize = (map: DraftMap) =>
    Object.fromEntries(
      Object.entries(map)
        .map(([k, v]) => [k, {
          monto: v.monto,
          subcategorias: v.subcategorias.filter(s => s.nombre.trim() !== '' || s.monto > 0),
        }])
        .filter(([, v]) => (v as BudgetEntry).monto > 0)
    )

  const isDirty = JSON.stringify(normalize(draft)) !== JSON.stringify(normalize(saved))

  const totals = (map: DraftMap) =>
    Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.monto]))

  useEffect(() => {
    fetch(`/api/budgets?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        const b: DraftMap = d.budgets ?? {}
        setSaved(b)
        setDraft(b)
        onBudgetsChange?.(totals(b))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [mes])

  const updateEntry = (cat: string, entry: BudgetEntry) => {
    const next = { ...draft, [cat]: entry }
    if (entry.monto === 0 && entry.subcategorias.length === 0) delete next[cat]
    setDraft(next)
    onBudgetsChange?.(totals(next))
  }

  const handleSave = async () => {
    setSaving(true)
    setSavedOk(false)
    try {
      const items = PRESUPUESTO_CATS.map(cat => ({
        categoria: cat,
        monto: draft[cat]?.monto ?? 0,
        subcategorias: draft[cat]?.subcategorias ?? [],
      }))
      const res = await fetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes, items }),
      })
      if (!res.ok) throw new Error('Error')
      setSaved(draft)
      setSavedOk(true)
      onSaved?.()
      setTimeout(() => setSavedOk(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const catsWithActivity = PRESUPUESTO_CATS.filter(
    cat => (gastosPorCategoria[cat] ?? 0) > 0 || (draft[cat]?.monto ?? 0) > 0
  )
  const catsEmpty = PRESUPUESTO_CATS.filter(
    cat => (gastosPorCategoria[cat] ?? 0) === 0 && (draft[cat]?.monto ?? 0) === 0
  )

  if (!loaded) return (
    <div className="card" style={{ padding: 20 }}>
      <div className="skeleton" style={{ height: 12, width: 120 }} />
    </div>
  )

  return (
    <div className="card" data-testid={TEST_IDS.BUDGET_MANAGER}>

      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '16px 16px 12px' }}>
        <div>
          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>Presupuesto mensual</p>
          <div className="flex items-center gap-3" style={{ marginTop: 3 }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Toca ▸ para desglosar
            </p>
            <button
              onClick={copyFromPrev}
              disabled={copying}
              aria-label="Copiar presupuesto del mes anterior"
              className="flex items-center gap-1 transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: copying ? 'default' : 'pointer', padding: 0 }}
            >
              <Copy size={10} />
              {copying ? 'Copiando…' : 'Copiar mes anterior'}
            </button>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          data-testid={TEST_IDS.BUDGET_SAVE_BUTTON}
          aria-label={saving ? 'Guardando presupuesto' : savedOk ? 'Presupuesto guardado' : 'Guardar presupuesto'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px',
            background: savedOk ? 'var(--green-soft)' : 'var(--surface-2)',
            border: `1px solid ${savedOk ? 'var(--green)' : isDirty ? 'var(--text-muted)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: savedOk ? 'var(--green)' : isDirty ? 'var(--text)' : 'var(--text-subtle)',
            fontSize: 'var(--text-xs)', fontWeight: 500,
            cursor: saving || !isDirty ? 'default' : 'pointer',
            opacity: !isDirty && !savedOk && !saving ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          {saving   ? <><RefreshCw size={11} className="animate-spin" /> Guardando…</> :
           savedOk  ? <><Check size={11} /> Guardado</> : 'Guardar'}
        </button>
      </div>

      {/* Categorías con actividad */}
      {catsWithActivity.map(cat => (
        <CategoryRow
          key={cat}
          cat={cat}
          entry={draft[cat] ?? { monto: 0, subcategorias: [] }}
          savedEntry={saved[cat] ?? { monto: 0, subcategorias: [] }}
          gasto={gastosPorCategoria[cat] ?? 0}
          isExpanded={expanded === cat}
          onToggle={() => setExpanded(prev => prev === cat ? null : cat)}
          onChange={entry => updateEntry(cat, entry)}
        />
      ))}

      {/* Categorías sin actividad — colapsadas */}
      {catsEmpty.length > 0 && (
        <details>
          <summary style={{ padding: '10px 16px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', cursor: 'pointer', listStyle: 'none', borderTop: catsWithActivity.length > 0 ? '1px solid var(--border-soft)' : 'none' }}>
            + {catsEmpty.length} categorías sin actividad
          </summary>
          {catsEmpty.map(cat => (
            <CategoryRow
              key={cat}
              cat={cat}
              entry={draft[cat] ?? { monto: 0, subcategorias: [] }}
              savedEntry={saved[cat] ?? { monto: 0, subcategorias: [] }}
              gasto={0}
              isExpanded={expanded === cat}
              onToggle={() => setExpanded(prev => prev === cat ? null : cat)}
              onChange={entry => updateEntry(cat, entry)}
            />
          ))}
        </details>
      )}
    </div>
  )
}

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({ cat, entry, savedEntry, gasto, isExpanded, onToggle, onChange }: {
  cat: Categoria
  entry: BudgetEntry
  savedEntry: BudgetEntry
  gasto: number
  isExpanded: boolean
  onToggle: () => void
  onChange: (e: BudgetEntry) => void
}) {
  const limite   = entry.monto
  const hasSubs  = entry.subcategorias.length > 0
  const pct      = limite > 0 ? (gasto / limite) * 100 : 0
  const over     = limite > 0 && gasto > limite
  const color    = limite > 0 ? pctColor(pct) : 'var(--text-muted)'
  const bgColor  = limite > 0 ? pctBg(pct) : 'transparent'
  const isDirty  = JSON.stringify(entry) !== JSON.stringify(savedEntry)

  const updateSubcat = (idx: number, field: keyof BudgetSubcat, value: string | number) => {
    const subs = entry.subcategorias.map((s, i) =>
      i === idx ? { ...s, [field]: field === 'monto' ? (Number(String(value).replace(/\D/g,'')) || 0) : value } : s
    )
    const total = subs.reduce((s, x) => s + x.monto, 0)
    onChange({ monto: total, subcategorias: subs })
  }

  const addSubcat = () => {
    const subs = [...entry.subcategorias, { nombre: '', monto: 0 }]
    onChange({ ...entry, subcategorias: subs })
  }

  const removeSubcat = (idx: number) => {
    const subs = entry.subcategorias.filter((_, i) => i !== idx)
    const total = subs.reduce((s, x) => s + x.monto, 0)
    onChange({ monto: total || entry.monto, subcategorias: subs })
  }

  const setDirectMonto = (raw: string) => {
    const monto = parseInt(raw.replace(/\D/g, ''), 10) || 0
    onChange({ monto, subcategorias: [] })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-soft)' }}>

      {/* Fila principal */}
      <div
        role="button"
        tabIndex={0}
        className="flex items-center gap-2"
        aria-expanded={isExpanded}
        aria-label={`${CATEGORIA_LABELS[cat]}: ${limite > 0 ? `límite ${formatCOP(limite)}` : 'sin límite'}${isExpanded ? ', expandido' : ''}`}
        style={{ padding: '12px 16px', cursor: 'pointer' }}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      >
        {/* Chevron */}
        <ChevronRight
          size={13}
          style={{
            color: 'var(--text-subtle)',
            flexShrink: 0,
            transition: 'transform 0.15s',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />

        {/* Nombre + dot de cambio */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
            {CATEGORIA_LABELS[cat]}
          </span>
          {isDirty && (
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--yellow)', display: 'inline-block', flexShrink: 0 }} />
          )}
          {hasSubs && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
              {entry.subcategorias.length} ítems
            </span>
          )}
        </div>

        {/* Gasto real + badge % */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="tabular-nums" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {formatCOP(gasto)}
          </span>
          {limite > 0 ? (
            <span className="tabular-nums" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color, background: bgColor, padding: '2px 7px', borderRadius: 'var(--radius-xs)' }}>
              {over ? `+${Math.round(pct - 100)}%` : `${Math.round(pct)}%`}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', minWidth: 48, textAlign: 'right' }}>sin límite</span>
          )}
        </div>
      </div>

      {/* Barra de progreso */}
      {limite > 0 && (
        <div style={{ margin: '-4px 16px 10px', height: 3, background: 'var(--border)', borderRadius: 99 }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.3s' }} />
        </div>
      )}

      {/* Panel expandido */}
      {isExpanded && (
        <div style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border-soft)', padding: '12px 16px 14px' }}>

          {/* Borrar presupuesto — solo si hay algo configurado */}
          {(limite > 0 || hasSubs) && (
            <div className="flex justify-end" style={{ marginBottom: 10 }}>
              <button
                onClick={() => onChange({ monto: 0, subcategorias: [] })}
                className="flex items-center gap-1"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', padding: 0 }}
              >
                <Trash2 size={11} /> Borrar presupuesto
              </button>
            </div>
          )}

          {hasSubs ? (
            <>
              {/* Subcategorías */}
              {entry.subcategorias.map((sub, idx) => (
                <SubcatRow
                  key={idx}
                  sub={sub}
                  onNameChange={v => updateSubcat(idx, 'nombre', v)}
                  onMontoChange={v => updateSubcat(idx, 'monto', v)}
                  onRemove={() => removeSubcat(idx)}
                />
              ))}

              {/* Total sumado */}
              <div className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-soft)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>Total {CATEGORIA_LABELS[cat]}</span>
                <span className="tabular-nums" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text)' }}>
                  {formatCOPCompact(limite)}
                </span>
              </div>
            </>
          ) : (
            /* Monto directo (sin subcats) */
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Límite directo</span>
              <div className="flex items-center gap-1 flex-1 justify-end">
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>$</span>
                <DirectInput value={limite} onChange={setDirectMonto} />
              </div>
            </div>
          )}

          {/* Botón agregar subcat */}
          <button
            onClick={addSubcat}
            className="flex items-center gap-1.5"
            style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: 0 }}
          >
            <Plus size={11} />
            {hasSubs ? 'Agregar ítem' : 'Desglosar en subcategorías'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── SubcatRow ─────────────────────────────────────────────────────────────────

function SubcatRow({ sub, onNameChange, onMontoChange, onRemove }: {
  sub: BudgetSubcat
  onNameChange: (v: string) => void
  onMontoChange: (v: string) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
      <input
        className="input-field"
        value={sub.nombre}
        onChange={e => onNameChange(e.target.value)}
        placeholder="Nombre (ej. Mercado)"
        aria-label="Nombre de la subcategoría"
        style={{ flex: 1, padding: '4px 8px' }}
      />
      <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }} aria-hidden="true">$</span>
        <input
          className="input-field"
          value={sub.monto > 0 ? sub.monto.toLocaleString('es-CO') : ''}
          onChange={e => onMontoChange(e.target.value)}
          placeholder="0"
          aria-label="Monto de la subcategoría"
          style={{ width: 88, padding: '4px 8px', textAlign: 'right' }}
        />
      </div>
      <button onClick={onRemove} aria-label="Eliminar subcategoría" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex', padding: 0 }}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── DirectInput ───────────────────────────────────────────────────────────────

function DirectInput({ value, onChange }: { value: number; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value > 0 ? String(value) : '')
  const ref = useRef<HTMLInputElement>(null)

  return (
    <input
      className="input-field"
      ref={ref}
      value={local}
      onChange={e => { setLocal(e.target.value); onChange(e.target.value) }}
      placeholder="0"
      data-testid={TEST_IDS.BUDGET_CATEGORY_INPUT}
      aria-label="Monto del presupuesto"
      style={{ width: 110, padding: '4px 8px', fontSize: 'var(--text-sm)', textAlign: 'right' }}
    />
  )
}
