'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Check, RefreshCw, ChevronRight, Plus, Trash2, Copy, ArrowLeft } from 'lucide-react'
import { CATEGORIA_LABELS, catLabel, normalizeCatKey, getCategoryColor, formatCOP, formatCOPCompact, PRESUPUESTO_CATS, type Categoria, type BudgetEntry, type BudgetSubcat } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import styles from './BudgetManager.module.css'

function pctColor(pct: number) {
  if (pct >= 110) return 'var(--red)'
  if (pct >= 80 && pct < 100) return 'var(--yellow)'
  return 'var(--green)'  // <80% saludable  ó  100-109% completado
}
function pctBg(pct: number) {
  if (pct >= 110) return 'var(--red-soft)'
  if (pct >= 80 && pct < 100) return 'var(--yellow-soft)'
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
    <div className={`card ${styles.loadingCard}`}>
      <div className={`skeleton ${styles.loadingSkeleton}`} />
    </div>
  )

  return (
    <>
    <div className="card" data-testid={TEST_IDS.BUDGET_MANAGER}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Volver al resumen"
              className={styles.backBtn}
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <p className={styles.headerTitle}>Presupuesto mensual</p>
        </div>
        <div className={styles.headerSub} style={{ paddingLeft: onClose ? 23 : 0 }}>
          <p className={styles.headerHint}>
            Toca ▸ para desglosar
          </p>
          <button
            onClick={copyFromPrev}
            disabled={copying}
            aria-label="Copiar presupuesto del mes anterior"
            className={styles.copyBtn}
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
      <div className={activeCats.length > 0 ? styles.addSectionBordered : styles.addSection}>
        {showPicker ? (
          <div>
            <div className={styles.pickerHeader}>
              <p className={styles.pickerLabel}>
                Agregar categoría
              </p>
              <button
                onClick={() => { setShowPicker(false); setCustomInput(''); setInputError(null) }}
                className={styles.pickerCancel}
              >
                Cancelar
              </button>
            </div>

            {/* Input para categoría custom */}
            <div className={styles.customInputRow}>
              <div className={styles.customInputFlex}>
                <input
                  className={`input-field ${styles.customInputField}`}
                  value={customInput}
                  onChange={e => { setCustomInput(e.target.value); setInputError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomCategory() }}
                  placeholder="Nombre (ej. Mascotas)"
                  maxLength={30}
                />
                <button
                  onClick={addCustomCategory}
                  disabled={!customInput.trim()}
                  className={customInput.trim() ? styles.createBtnActive : styles.createBtnDisabled}
                >
                  Crear
                </button>
              </div>
              {inputError && (
                <p className={styles.inputError}>{inputError}</p>
              )}
            </div>

            {/* Chips de categorías predefinidas disponibles */}
            {availablePredefined.length > 0 && (
              <>
                <p className={styles.predefinedLabel}>
                  O elige una existente
                </p>
                <div className={styles.chipList}>
                  {availablePredefined.map(cat => (
                    <button
                      key={cat}
                      onClick={() => addCategory(cat)}
                      className={styles.chip}
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
            className={styles.addBtn}
          >
            <Plus size={12} />
            Agregar categoría
          </button>
        )}
      </div>

      {/* Footer — resumen de asignación */}
      {(totalPresupuestado > 0 || ingresos > 0) && (
        <div className={styles.footer}>
          <div className={styles.footerRow}>
            <span className={styles.footerLabel}>Total presupuestado</span>
            <span className={styles.footerTotal}>
              {formatCOP(totalPresupuestado)}
            </span>
          </div>
          {ingresos > 0 && (
            <div className={styles.footerRowLast}>
              <span className={styles.footerLabel}>
                {restante >= 0 ? 'Sin asignar' : 'Excedido'}
              </span>
              <span className={restante >= 0 ? styles.restanteOk : styles.restanteOver}>
                {restante >= 0 ? formatCOP(restante) : `−${formatCOP(Math.abs(restante))}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Floating save bar */}
    {isDirty && loaded && typeof document !== 'undefined' && createPortal(
      <div className={styles.saveBarWrap}>
        <div className={styles.saveBar}>
          <span className={styles.saveBarLabel}>
            Cambios sin guardar
          </span>
          <div className={styles.saveBarActions}>
            <button
              onClick={() => { setDraft(saved); onBudgetsChange?.(totals(saved)) }}
              className={styles.discardBtn}
            >
              Descartar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              data-testid={TEST_IDS.BUDGET_SAVE_BUTTON}
              aria-label={saving ? 'Guardando presupuesto' : 'Guardar presupuesto'}
              className={`${styles.saveBtn} ${savedOk ? styles.saveBtnOk : styles.saveBtnNormal}`}
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
  const barFill  = limite > 0 ? pctColor(pct) : 'var(--border)'
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
    <div className={styles.catRowWrap}>

      {/* Fila principal */}
      <div
        role="button"
        tabIndex={0}
        className={styles.catRowMain}
        aria-expanded={isExpanded}
        aria-label={`${catLabel(cat)}: ${limite > 0 ? `límite ${formatCOP(limite)}` : 'sin límite'}${isExpanded ? ', expandido' : ''}`}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      >
        {/* Chevron */}
        <ChevronRight
          size={13}
          className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : styles.chevronClosed}`}
        />

        {/* Nombre + dot de cambio */}
        <div className={styles.catNameGroup}>
          <span className={styles.catDot} style={{ background: getCategoryColor(cat) }} />
          <span className={styles.catName}>
            {catLabel(cat)}
          </span>
          {isDirty && (
            <span className={styles.dirtyDot} />
          )}
          {hasSubs && (
            <span className={styles.subcatCount}>
              {entry.subcategorias.length} ítems
            </span>
          )}
        </div>

        {/* Gasto real + badge % + quitar */}
        <div className={styles.catRight}>
          <span className={styles.catGasto}>
            {formatCOP(gasto)}
          </span>
          {limite > 0 ? (
            <span
              className={styles.pctBadge}
              style={{ '--clr': color, '--bg-clr': bgColor } as React.CSSProperties}
            >
              {pct >= 110 ? `+${Math.round(pct - 100)}%` : pct >= 100 ? <Check size={12} strokeWidth={2.5} /> : `${Math.round(pct)}%`}
            </span>
          ) : (
            <span className={styles.noLimitLabel}>sin límite</span>
          )}
          {onRemove && (
            <button
              onClick={e => { e.stopPropagation(); onRemove() }}
              aria-label={`Quitar ${catLabel(cat)} del presupuesto`}
              className={styles.removeBtn}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Barra de progreso */}
      {limite > 0 && (
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.min(pct, 100)}%`, '--fill-clr': barFill } as React.CSSProperties}
          />
        </div>
      )}

      {/* Panel expandido */}
      {isExpanded && (
        <div className={styles.expandPanel}>

          {/* Borrar presupuesto — solo si hay algo configurado */}
          {(limite > 0 || hasSubs) && (
            <div className={styles.deleteRow}>
              <button
                onClick={() => onChange({ monto: 0, subcategorias: [] })}
                className={styles.deleteBtn}
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
              <div className={styles.subcatTotal}>
                <span className={styles.subcatTotalLabel}>Total {catLabel(cat)}</span>
                <span className={styles.subcatTotalValue}>
                  {formatCOPCompact(limite)}
                </span>
              </div>
            </>
          ) : (
            /* Monto directo (sin subcats) */
            <div className={styles.directRow}>
              <span className={styles.directLabel}>Límite directo</span>
              <div className={styles.directInputGroup}>
                <span className={styles.currencySign}>$</span>
                <DirectInput value={limite} onChange={setDirectMonto} />
              </div>
            </div>
          )}

          {/* Botón agregar subcat */}
          <button
            onClick={addSubcat}
            className={styles.addSubcatBtn}
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
    <div className={styles.subcatRow}>
      <input
        className={`input-field ${styles.subcatNameInput}`}
        value={sub.nombre}
        onChange={e => onNameChange(e.target.value)}
        placeholder="Nombre (ej. Mercado)"
        aria-label="Nombre de la subcategoría"
      />
      <div className={styles.subcatMontoGroup}>
        <span className={styles.subcatCurrencySign} aria-hidden="true">$</span>
        <input
          className={`input-field ${styles.subcatMontoInput}`}
          value={sub.monto > 0 ? sub.monto.toLocaleString('es-CO') : ''}
          onChange={e => onMontoChange(e.target.value)}
          placeholder="0"
          aria-label="Monto de la subcategoría"
        />
      </div>
      <button onClick={onRemove} aria-label="Eliminar subcategoría" className={styles.subcatRemoveBtn}>
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
      className={`input-field ${styles.directInputField}`}
      ref={ref}
      value={local}
      onChange={e => { setLocal(e.target.value); onChange(e.target.value) }}
      placeholder="0"
      data-testid={TEST_IDS.BUDGET_CATEGORY_INPUT}
      aria-label="Monto del presupuesto"
    />
  )
}
