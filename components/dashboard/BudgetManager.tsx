'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Check, RefreshCw, ChevronRight, Plus, Trash2, Copy, ArrowLeft } from 'lucide-react'
import { CATEGORIA_LABELS, catLabel, normalizeCatKey, getCategoryColor, formatCOP, formatCOPCompact, PRESUPUESTO_CATS, type Categoria, type BudgetEntry, type BudgetSubcat } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

function pctColor(pct: number) {
  if (pct >= 110) return 'var(--red)'
  if (pct >= 100) return '#f97316'   // orange — usó el presupuesto, normal
  if (pct >= 80)  return 'var(--yellow)'
  return 'var(--green)'
}
function pctBg(pct: number) {
  if (pct >= 110) return 'var(--red-soft)'
  if (pct >= 100) return '#f9731620'
  if (pct >= 80)  return 'var(--yellow-soft)'
  return 'var(--green-soft)'
}

type DraftMap = Record<string, BudgetEntry>

interface Props {
  mes: string
  gastosPorCategoria: Record<string, number>
  ingresos?: number
  initialBudgets?: DraftMap
  onBudgetsChange?: (totals: Record<string, number>) => void
  onSaved?: () => void
  onClose?: () => void
}

function budgetedKeys(map: DraftMap): Set<string> {
  return new Set(
    Object.entries(map)
      .filter(([, v]) => v.monto > 0)
      .map(([k]) => k)
  )
}

export default function BudgetManager({ mes, gastosPorCategoria, ingresos = 0, initialBudgets, onBudgetsChange, onSaved, onClose }: Props) {
  const [saved,      setSaved]      = useState<DraftMap>(initialBudgets ?? {})
  const [draft,      setDraft]      = useState<DraftMap>(initialBudgets ?? {})
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [savedOk,    setSavedOk]    = useState(false)
  const [loaded,     setLoaded]     = useState(!!initialBudgets)
  const [copying,    setCopying]    = useState(false)
  const [pinnedCats,   setPinnedCats]   = useState<Set<string>>(
    () => initialBudgets ? budgetedKeys(initialBudgets) : new Set()
  )
  const [showPicker,   setShowPicker]   = useState(false)
  const [customInput,  setCustomInput]  = useState('')
  const [inputError,   setInputError]   = useState<string | null>(null)

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
        setPinnedCats(prev => new Set([...prev, ...budgetedKeys(b)]))
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
    if (initialBudgets) return  // ya tenemos los datos — no re-fetchar
    setLoaded(false)
    setPinnedCats(new Set())
    fetch(`/api/budgets?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        const b: DraftMap = d.budgets ?? {}
        setSaved(b)
        setDraft(b)
        onBudgetsChange?.(totals(b))
        setPinnedCats(budgetedKeys(b))
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
      const keysToSend = new Set([
        ...Object.keys(draft),
        ...Object.keys(saved).filter(k => !((draft[k]?.monto ?? 0) > 0)),
      ])
      const items = [...keysToSend].map(cat => ({
        categoria: cat as Categoria,
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

  const totalPresupuestado = Object.values(draft).reduce((s, v) => s + v.monto, 0)
  const restante = ingresos - totalPresupuestado

  const predefinedSet = useMemo(() => new Set<string>(PRESUPUESTO_CATS), [])

  const activeCats = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const cat of PRESUPUESTO_CATS) {
      if ((gastosPorCategoria[cat] ?? 0) > 0 || (draft[cat]?.monto ?? 0) > 0 || pinnedCats.has(cat)) {
        seen.add(cat); result.push(cat)
      }
    }
    for (const cat of [...pinnedCats, ...Object.keys(draft)]) {
      if (!seen.has(cat) && !predefinedSet.has(cat)) {
        seen.add(cat); result.push(cat)
      }
    }
    return result
  }, [gastosPorCategoria, draft, pinnedCats, predefinedSet])

  const availablePredefined = useMemo(
    () => PRESUPUESTO_CATS.filter(cat => !activeCats.includes(cat)),
    [activeCats]
  )

  const addCategory = (cat: string) => {
    const nextDraft = { ...draft, [cat]: draft[cat] ?? { monto: 0, subcategorias: [] } }
    setDraft(nextDraft)
    onBudgetsChange?.(totals(nextDraft))
    setPinnedCats(prev => new Set([...prev, cat]))
    setShowPicker(false)
  }

  const addCustomCategory = () => {
    const name = customInput.trim()
    if (!name) return
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(name)) {
      setInputError('Solo se permiten letras')
      return
    }
    if (name.length < 2) {
      setInputError('Mínimo 2 letras')
      return
    }
    const key = normalizeCatKey(name)
    const existingLabels = activeCats.map(c => normalizeCatKey(catLabel(c)))
    if (existingLabels.includes(key)) {
      setInputError('Ya existe esta categoría')
      return
    }
    addCategory(key)
    setCustomInput('')
    setInputError(null)
  }

  const removeCategory = (cat: string) => {
    const next = { ...draft }
    delete next[cat]
    setDraft(next)
    onBudgetsChange?.(totals(next))
    setPinnedCats(prev => { const n = new Set(prev); n.delete(cat); return n })
  }

  if (!loaded) return (
    <div className="card" style={{ padding: 20 }}>
      <div className="skeleton" style={{ height: 12, width: 120 }} />
    </div>
  )

  return (
    <>
    <div className="card" data-testid={TEST_IDS.BUDGET_MANAGER}>

      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-soft)' }}>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Volver al resumen"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px 4px 2px 0' }}
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>Presupuesto mensual</p>
        </div>
        <div className="flex items-center gap-3" style={{ marginTop: 4, paddingLeft: onClose ? 23 : 0 }}>
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

      {/* Categorías activas */}
      {activeCats.map(cat => (
        <CategoryRow
          key={cat}
          cat={cat}
          entry={draft[cat] ?? { monto: 0, subcategorias: [] }}
          savedEntry={saved[cat] ?? { monto: 0, subcategorias: [] }}
          gasto={gastosPorCategoria[cat] ?? 0}
          isExpanded={expanded === cat}
          onToggle={() => setExpanded(prev => prev === cat ? null : cat)}
          onChange={entry => updateEntry(cat, entry)}
          onRemove={(gastosPorCategoria[cat] ?? 0) === 0 ? () => removeCategory(cat) : undefined}
        />
      ))}

      {/* Agregar categoría */}
      <div style={{ borderTop: activeCats.length > 0 ? '1px solid var(--border-soft)' : 'none', padding: '10px 16px' }}>
        {showPicker ? (
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
                Agregar categoría
              </p>
              <button
                onClick={() => { setShowPicker(false); setCustomInput(''); setInputError(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', padding: 0 }}
              >
                Cancelar
              </button>
            </div>

            {/* Input para categoría custom */}
            <div style={{ marginBottom: 12 }}>
              <div className="flex gap-2">
                <input
                  className="input-field"
                  value={customInput}
                  onChange={e => { setCustomInput(e.target.value); setInputError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomCategory() }}
                  placeholder="Nombre (ej. Mascotas)"
                  maxLength={30}
                  style={{ flex: 1, padding: '6px 10px', fontSize: 'var(--text-sm)' }}
                />
                <button
                  onClick={addCustomCategory}
                  disabled={!customInput.trim()}
                  style={{
                    padding: '6px 14px',
                    background: customInput.trim() ? 'var(--text)' : 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: customInput.trim() ? 'var(--bg)' : 'var(--text-subtle)',
                    fontSize: 'var(--text-xs)', fontWeight: 600,
                    cursor: customInput.trim() ? 'pointer' : 'default',
                    flexShrink: 0,
                  }}
                >
                  Crear
                </button>
              </div>
              {inputError && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', marginTop: 4 }}>{inputError}</p>
              )}
            </div>

            {/* Chips de categorías predefinidas disponibles */}
            {availablePredefined.length > 0 && (
              <>
                <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-subtle)', marginBottom: 8 }}>
                  O elige una existente
                </p>
                <div className="flex flex-wrap gap-2">
                  {availablePredefined.map(cat => (
                    <button
                      key={cat}
                      onClick={() => addCategory(cat)}
                      style={{
                        padding: '6px 14px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-pill)',
                        color: 'var(--text)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      {CATEGORIA_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500, padding: 0 }}
          >
            <Plus size={12} />
            Agregar categoría
          </button>
        )}
      </div>

      {/* Footer — resumen de asignación */}
      {(totalPresupuestado > 0 || ingresos > 0) && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--surface-2)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Total presupuestado</span>
            <span className="tabular-nums" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text)' }}>
              {formatCOP(totalPresupuestado)}
            </span>
          </div>
          {ingresos > 0 && (
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {restante >= 0 ? 'Sin asignar' : 'Excedido'}
              </span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 700,
                  color: restante >= 0 ? 'var(--green)' : 'var(--red)',
                }}
              >
                {restante >= 0 ? formatCOP(restante) : `−${formatCOP(Math.abs(restante))}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Floating save bar */}
    {isDirty && loaded && typeof document !== 'undefined' && createPortal(
      <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, width: 'calc(100% - 32px)', maxWidth: 480 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)',
          padding: '10px 10px 10px 18px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
            Cambios sin guardar
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setDraft(saved); onBudgetsChange?.(totals(saved)) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500, padding: '6px 10px' }}
            >
              Descartar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              data-testid={TEST_IDS.BUDGET_SAVE_BUTTON}
              aria-label={saving ? 'Guardando presupuesto' : 'Guardar presupuesto'}
              className="flex items-center gap-1.5"
              style={{
                background: savedOk ? 'var(--green)' : 'var(--text)',
                border: 'none',
                borderRadius: 'var(--radius-pill)',
                padding: '7px 16px',
                color: 'var(--bg)',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving   ? <><RefreshCw size={11} className="animate-spin" /> Guardando…</> :
               savedOk  ? <><Check size={11} /> Guardado</> : 'Guardar'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  )
}

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({ cat, entry, savedEntry, gasto, isExpanded, onToggle, onChange, onRemove }: {
  cat: string
  entry: BudgetEntry
  savedEntry: BudgetEntry
  gasto: number
  isExpanded: boolean
  onToggle: () => void
  onChange: (e: BudgetEntry) => void
  onRemove?: () => void
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
        aria-label={`${catLabel(cat)}: ${limite > 0 ? `límite ${formatCOP(limite)}` : 'sin límite'}${isExpanded ? ', expandido' : ''}`}
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
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: getCategoryColor(cat), flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
            {catLabel(cat)}
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

        {/* Gasto real + badge % + quitar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="tabular-nums" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {formatCOP(gasto)}
          </span>
          {limite > 0 ? (
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color, background: bgColor, padding: '2px 7px', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center' }}>
              {pct >= 110 ? `+${Math.round(pct - 100)}%` : pct >= 100 ? <Check size={12} strokeWidth={2.5} /> : `${Math.round(pct)}%`}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', minWidth: 48, textAlign: 'right' }}>sin límite</span>
          )}
          {onRemove && (
            <button
              onClick={e => { e.stopPropagation(); onRemove() }}
              aria-label={`Quitar ${catLabel(cat)} del presupuesto`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex', padding: 2, opacity: 0.5, lineHeight: 1, fontSize: 14 }}
            >
              ×
            </button>
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
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>Total {catLabel(cat)}</span>
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
