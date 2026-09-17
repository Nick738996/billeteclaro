'use client'

import { useState, useEffect, useMemo } from 'react'
import { Check, ChevronRight, Plus, Trash2, Copy, ArrowLeft } from 'lucide-react'
import { CATEGORIA_LABELS, catLabel, normalizeCatKey, getCategoryColor, formatCOP, FIJO_CATS, type Categoria, type BudgetEntry, type BudgetSubcat } from '@/lib/types'
import { isFijoBudgetCategory } from '@/lib/services/layerService'
import { getCategoryIcon } from '@/lib/categoryIcons'
import { TEST_IDS } from '@/lib/testIds'
import FloatingSaveBar from '@/components/ui/FloatingSaveBar'
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

interface PlanEntry {
  ingresoNetoMensual: number
  ahorroMetaMonto: number
}

interface Props {
  mes: string
  gastosPorCategoria: Record<string, number>
  initialBudgets?: DraftMap
  initialPlan?: PlanEntry | null
  onBudgetsChange?: (totals: Record<string, number>) => void
  onPlanChange?: (plan: PlanEntry) => void
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

function digitsToNumber(value: string): number {
  return parseInt(value.replace(/\D/g, ''), 10) || 0
}

function formatDigits(value: string): string {
  return value ? digitsToNumber(value).toLocaleString('es-CO') : ''
}

function daysInMonth(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export default function BudgetManager({
  mes, gastosPorCategoria, initialBudgets, initialPlan, onBudgetsChange, onPlanChange, onSaved, onClose,
}: Props) {
  const [saved,      setSaved]      = useState<DraftMap>(initialBudgets ?? {})
  const [draft,      setDraft]      = useState<DraftMap>(initialBudgets ?? {})
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [savedOk,    setSavedOk]    = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [loaded,     setLoaded]     = useState(!!initialBudgets)
  const [copying,    setCopying]    = useState(false)
  const [pinnedCats,   setPinnedCats]   = useState<Set<string>>(
    () => initialBudgets ? budgetedKeys(initialBudgets) : new Set()
  )
  const [showPicker,   setShowPicker]   = useState(false)
  const [customInput,  setCustomInput]  = useState('')
  const [inputError,   setInputError]   = useState<string | null>(null)

  // ── Plan (ingreso + meta de ahorro) ──────────────────────────────────────────
  const [planIngreso, setPlanIngreso] = useState(initialPlan ? String(initialPlan.ingresoNetoMensual) : '')
  const [planAhorro,  setPlanAhorro]  = useState(initialPlan ? String(initialPlan.ahorroMetaMonto) : '')
  const [planSaved,   setPlanSaved]   = useState<PlanEntry>(initialPlan ?? { ingresoNetoMensual: 0, ahorroMetaMonto: 0 })
  const [planLoaded,  setPlanLoaded]  = useState(!!initialPlan)

  const [yy, mm] = mes.split('-').map(Number)
  const prevMes = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`

  const copyFromPrev = async () => {
    setCopying(true)
    try {
      const [budgetsRes, planRes] = await Promise.all([
        fetch(`/api/budgets?mes=${prevMes}`),
        fetch(`/api/monthly-plan?mes=${prevMes}`),
      ])
      const bd = await budgetsRes.json()
      const b: DraftMap = bd.budgets ?? {}
      const fijoOnly = Object.fromEntries(Object.entries(b).filter(([cat]) => isFijoBudgetCategory(cat)))
      if (Object.keys(fijoOnly).length > 0) {
        setDraft(fijoOnly)
        onBudgetsChange?.(totals(fijoOnly))
        setPinnedCats(prev => new Set([...prev, ...budgetedKeys(fijoOnly)]))
      }
      const pd = await planRes.json()
      if (pd.plan) {
        setPlanIngreso(String(pd.plan.ingresoNetoMensual))
        setPlanAhorro(String(pd.plan.ahorroMetaMonto))
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

  const budgetsDirty = JSON.stringify(normalize(draft)) !== JSON.stringify(normalize(saved))
  const planDirty = digitsToNumber(planIngreso) !== planSaved.ingresoNetoMensual || digitsToNumber(planAhorro) !== planSaved.ahorroMetaMonto
  const isDirty = budgetsDirty || planDirty

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

  useEffect(() => {
    if (initialPlan) return
    setPlanLoaded(false)
    fetch(`/api/monthly-plan?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        const plan: PlanEntry = d.plan ?? { ingresoNetoMensual: 0, ahorroMetaMonto: 0 }
        setPlanSaved(plan)
        setPlanIngreso(plan.ingresoNetoMensual > 0 ? String(plan.ingresoNetoMensual) : '')
        setPlanAhorro(plan.ahorroMetaMonto > 0 ? String(plan.ahorroMetaMonto) : '')
        setPlanLoaded(true)
      })
      .catch(() => setPlanLoaded(true))
  }, [mes])

  const updateEntry = (cat: string, entry: BudgetEntry) => {
    const next = { ...draft, [cat]: entry }
    if (entry.monto === 0 && entry.subcategorias.length === 0) delete next[cat]
    setDraft(next)
    onBudgetsChange?.(totals(next))
  }

  const handlePlanInput = (field: 'ingreso' | 'ahorro', raw: string) => {
    if (field === 'ingreso') setPlanIngreso(raw)
    else setPlanAhorro(raw)
    onPlanChange?.({
      ingresoNetoMensual: digitsToNumber(field === 'ingreso' ? raw : planIngreso),
      ahorroMetaMonto: digitsToNumber(field === 'ahorro' ? raw : planAhorro),
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setSavedOk(false)
    setSaveError(null)
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

      const newCustomFijoCats = items
        .filter(i => i.monto > 0 && !(i.categoria in CATEGORIA_LABELS))
        .map(i => i.categoria)

      const requests: Promise<Response>[] = [
        fetch('/api/budgets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mes, items }),
        }),
        ...newCustomFijoCats.map(categoria =>
          fetch('/api/category-capas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoria, capa: 'FIJO' }),
          })
        ),
      ]

      const newPlan: PlanEntry = { ingresoNetoMensual: digitsToNumber(planIngreso), ahorroMetaMonto: digitsToNumber(planAhorro) }
      if (planDirty && newPlan.ingresoNetoMensual > 0) {
        requests.push(fetch('/api/monthly-plan', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mes, ...newPlan }),
        }))
      }

      const results = await Promise.all(requests)
      if (results.some(r => !r.ok)) throw new Error('Error al guardar')

      setSaved(draft)
      if (planDirty && newPlan.ingresoNetoMensual > 0) {
        setPlanSaved(newPlan)
        onPlanChange?.(newPlan)
      }
      setSavedOk(true)
      onSaved?.()
      setTimeout(() => setSavedOk(false), 3000)
    } catch {
      // Bug corregido: el fetch no tenía catch — un fallo de red o del servidor
      // quedaba silencioso. Ahora se muestra en la barra flotante con "Reintentar".
      setSaveError('Error al guardar, revisa tu conexión')
    } finally {
      setSaving(false)
    }
  }

  const totalFijo = Object.entries(draft)
    .filter(([cat]) => isFijoBudgetCategory(cat))
    .reduce((s, [, v]) => s + v.monto, 0)

  const ingresoNum = digitsToNumber(planIngreso)
  const ahorroNum = digitsToNumber(planAhorro)
  const poolVariable = Math.max(0, ingresoNum - totalFijo - ahorroNum)
  const numWeeks = Math.max(1, Math.round(daysInMonth(mes) / 7))
  const ahorroPct = ingresoNum > 0 ? Math.round((ahorroNum / ingresoNum) * 100) : null
  const fijoPct = ingresoNum > 0 ? Math.round((totalFijo / ingresoNum) * 100) : null
  const variablePct = ingresoNum > 0 ? Math.round((poolVariable / ingresoNum) * 100) : null

  const predefinedSet = useMemo(() => new Set<string>(FIJO_CATS), [])

  // Orden por urgencia real, no por declaración fija. Primero TODO lo que tiene
  // presupuesto asignado (por urgencia), y solo al final lo que no tiene —
  // para que "sin presupuesto" nunca quede interrumpiendo la mitad de la lista:
  //  0: excedida (≥100%)                   3: con presupuesto, sin gasto este mes
  //  1: cerca del límite (80-99%)          4: sin presupuesto pero con gasto
  //  2: con presupuesto y gasto, sana         (candidata a "+ Definir")
  //     (<80%)                            5: vacía (sin presupuesto ni gasto)
  const catRank = (cat: string, draftMap: DraftMap) => {
    const gasto  = gastosPorCategoria[cat] ?? 0
    const limite = draftMap[cat]?.monto ?? 0
    if (limite > 0) {
      const pct = (gasto / limite) * 100
      if (pct >= 100) return 0
      if (pct >= 80) return 1
      return gasto > 0 ? 2 : 3
    }
    return gasto > 0 ? 4 : 5
  }
  const catScore = (cat: string, draftMap: DraftMap) => {
    const gasto  = gastosPorCategoria[cat] ?? 0
    const limite = draftMap[cat]?.monto ?? 0
    return limite > 0 ? gasto / limite : gasto
  }

  const activeCats = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const cat of FIJO_CATS) {
      if ((gastosPorCategoria[cat] ?? 0) > 0 || (draft[cat]?.monto ?? 0) > 0 || pinnedCats.has(cat)) {
        seen.add(cat); result.push(cat)
      }
    }
    for (const cat of [...pinnedCats, ...Object.keys(draft)]) {
      if (!seen.has(cat) && !predefinedSet.has(cat) && isFijoBudgetCategory(cat)) {
        seen.add(cat); result.push(cat)
      }
    }
    return result.sort((a, b) => {
      const r = catRank(a, draft) - catRank(b, draft)
      return r !== 0 ? r : catScore(b, draft) - catScore(a, draft)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gastosPorCategoria, draft, pinnedCats, predefinedSet])

  const availablePredefined = useMemo(
    () => FIJO_CATS.filter(cat => !activeCats.includes(cat)),
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

  if (!loaded || !planLoaded) return (
    <div className={`card ${styles.loadingCard}`}>
      {[80, 60, 90].map((w, i) => (
        <div key={i} className={styles.loadingRow}>
          <div className={`skeleton ${styles.loadingDot}`} />
          <div className={styles.loadingRowMain}>
            <div className={`skeleton ${styles.loadingLabel}`} style={{ '--skel-w': `${w}%` } as React.CSSProperties} />
            <div className={`skeleton ${styles.loadingBar}`} />
          </div>
        </div>
      ))}
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
          <p className={styles.headerTitle}>Tu plan mensual</p>
        </div>
        <div className={styles.headerSub} style={{ paddingLeft: onClose ? 23 : 0 }}>
          <p className={styles.headerHint}>
            Ingreso, ahorro y fijos: lo variable se reparte solo en tu cupo semanal
          </p>
          <button
            onClick={copyFromPrev}
            disabled={copying}
            aria-label="Copiar el mes anterior"
            className={styles.copyBtn}
          >
            <Copy size={10} />
            {copying ? 'Copiando…' : 'Copiar mes anterior'}
          </button>
        </div>
      </div>

      {/* Ahorro: ingreso + meta, la única entrada manual de este bloque */}
      <div className={styles.planSection}>
        <p className={styles.planSectionTitle}>Ahorro y Blindaje</p>
        <label className={styles.planLabel}>
          Ingreso neto mensual
          <div className={styles.planInputGroup}>
            <span className={styles.currencySign}>$</span>
            <input
              className={`input-field ${styles.planInputField}`}
              inputMode="numeric"
              placeholder="0"
              value={formatDigits(planIngreso)}
              onChange={e => handlePlanInput('ingreso', e.target.value)}
            />
          </div>
        </label>
        <label className={styles.planLabel}>
          <span className={styles.planLabelRow}>
            Meta de ahorro este mes
            {ahorroPct !== null && <span className={styles.planPct}>{ahorroPct}% del ingreso</span>}
          </span>
          <div className={styles.planInputGroup}>
            <span className={styles.currencySign}>$</span>
            <input
              className={`input-field ${styles.planInputField}`}
              inputMode="numeric"
              placeholder="0"
              value={formatDigits(planAhorro)}
              onChange={e => handlePlanInput('ahorro', e.target.value)}
            />
          </div>
        </label>
        <p className={styles.planBenchmark}>
          Dinero que apartas antes de gastar: fondo de emergencia, metas, inversión.
          Recomendado: 20-30% de tu ingreso.
        </p>
      </div>

      {/* Gastos Fijos */}
      <div className={styles.sectionDivider}>
        <p className={styles.sectionDividerLabel}>Gastos Fijos</p>
        <p className={styles.sectionDividerHint}>
          Lo que pagas sí o sí cada mes, mismo monto o parecido: arriendo, servicios,
          salud prepagada, suscripciones. Recomendado: 45-50% de tu ingreso
          {fijoPct !== null && ` · hoy vas en ${fijoPct}%`}.
        </p>
      </div>

      {activeCats.length === 0 && !showPicker && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Aún no tienes fijos configurados</p>
          <p className={styles.emptyHint}>Cópialos del mes pasado o agrega el primero</p>
          <div className={styles.emptyActions}>
            <button onClick={copyFromPrev} disabled={copying} className={styles.emptyPrimaryBtn}>
              <Copy size={12} />
              {copying ? 'Copiando…' : 'Copiar mes anterior'}
            </button>
            <button onClick={() => setShowPicker(true)} className={styles.emptySecondaryBtn}>
              <Plus size={12} />
              Agregar fijo
            </button>
          </div>
        </div>
      )}

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
          onRemove={() => removeCategory(cat)}
        />
      ))}

      {/* Agregar categoría fija */}
      {(activeCats.length > 0 || showPicker) && (
      <div className={activeCats.length > 0 ? styles.addSectionBordered : styles.addSection}>
        {showPicker ? (
          <div>
            <div className={styles.pickerHeader}>
              <p className={styles.pickerLabel}>
                Agregar gasto fijo
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
                  placeholder="Nombre (ej. Colegio)"
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

            {/* Chips de categorías fijas predefinidas disponibles */}
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
            Agregar gasto fijo
          </button>
        )}
      </div>
      )}

      {/* Gasto Variable: derivado, no se presupuesta por categoría */}
      <div className={styles.sectionDivider}>
        <p className={styles.sectionDividerLabel}>Gasto Variable</p>
        <p className={styles.sectionDividerHint}>
          Todo lo demás: restaurantes, transporte, compras, antojos. No lo presupuestas
          por categoría, se reparte solo en tu cupo semanal. Recomendado: 25-30% de tu ingreso
          {variablePct !== null && ` · hoy es ${variablePct}%`}.
        </p>
      </div>
      <div className={styles.variableSection}>
        {ingresoNum > 0 ? (
          <>
            <div className={styles.variableAmountRow}>
              <span className={styles.variableLabel}>Pool disponible este mes</span>
              <span className={styles.variableAmount}>{formatCOP(poolVariable)}</span>
            </div>
            <p className={styles.variableHint}>
              ≈ {formatCOP(Math.round(poolVariable / numWeeks))} por semana ({numWeeks} semanas) ·
              revisa tu cupo vivo en la tarjeta de arriba del dashboard
            </p>
            {/* Toggle "Gasto Fijo" (sección 3C del brief): la forma de mover un gasto
                individual de Variable a Fijo (o viceversa) es reclasificarlo en la
                lista de transacciones, no acá — acá solo se ve el pool agregado. */}
            <p className={styles.variableFootnote}>
              ¿Un gasto de aquí en realidad es fijo? Cámbialo desde la lista de
              transacciones, tocando su etiqueta de capa.
            </p>
          </>
        ) : (
          <p className={styles.variableHint}>
            Define tu ingreso neto mensual arriba para ver cuánto te queda libre para gastar
          </p>
        )}
      </div>

      {/* Footer — resumen de asignación */}
      <div className={styles.footer}>
        <div className={styles.footerRow}>
          <span className={styles.footerLabel}>Total fijos</span>
          <span className={styles.footerTotal}>
            {formatCOP(totalFijo)}
          </span>
        </div>
        <div className={styles.footerRowLast}>
          <span className={styles.footerLabel}>Meta de ahorro</span>
          <span className={styles.footerTotal}>
            {formatCOP(ahorroNum)}
          </span>
        </div>
      </div>
    </div>

    {/* Floating save bar */}
    {isDirty && (
      <FloatingSaveBar
        label={saveError ?? 'Cambios sin guardar'}
        state={saving ? 'saving' : savedOk ? 'saved' : saveError ? 'error' : 'idle'}
        onDiscard={() => {
          setDraft(saved)
          setPlanIngreso(planSaved.ingresoNetoMensual > 0 ? String(planSaved.ingresoNetoMensual) : '')
          setPlanAhorro(planSaved.ahorroMetaMonto > 0 ? String(planSaved.ahorroMetaMonto) : '')
          setSaveError(null)
          onBudgetsChange?.(totals(saved))
          onPlanChange?.(planSaved)
        }}
        onSave={handleSave}
        saveTestId={TEST_IDS.BUDGET_SAVE_BUTTON}
        saveAriaLabel={saving ? 'Guardando presupuesto' : saveError ? 'Reintentar guardado' : 'Guardar presupuesto'}
      />
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
  onRemove: () => void
}) {
  const limite   = entry.monto
  const hasSubs  = entry.subcategorias.length > 0
  const pct      = limite > 0 ? (gasto / limite) * 100 : 0
  const color    = limite > 0 ? pctColor(pct) : 'var(--text-muted)'
  const bgColor  = limite > 0 ? pctBg(pct) : 'transparent'
  const isDirty  = JSON.stringify(entry) !== JSON.stringify(savedEntry)
  const CatIcon  = getCategoryIcon(cat)

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
          <span
            className={styles.catIconDot}
            style={{ color: getCategoryColor(cat) }}
          >
            <CatIcon size={19} />
          </span>
          <span className={styles.catName}>
            {catLabel(cat)}
          </span>
          {isDirty && (
            <span className={styles.dirtyDot} />
          )}
          {hasSubs && (
            <span className={styles.subcatCount}>
              {entry.subcategorias.length} ítem{entry.subcategorias.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Presupuestado + badge % — esta pantalla es para configurar
            límites, no para revisar gasto (eso ya lo hace la vista
            compacta con la barra), así que el número que importa acá es
            el límite que le pusiste a la categoría. */}
        <div className={styles.catRight}>
          <span className={styles.catLimite}>
            {formatCOP(limite)}
          </span>
          {limite > 0 ? (
            <span
              className={styles.pctBadge}
              style={{ '--clr': color, '--bg-clr': bgColor } as React.CSSProperties}
            >
              {pct >= 110 ? `+${Math.round(pct - 100)}%` : pct >= 100 ? <Check size={12} strokeWidth={2.5} /> : `${Math.round(pct)}%`}
            </span>
          ) : (
            // Ya no es un botón separado — un solo camino para definir el
            // límite: tocar la fila (onToggle en catRowMain) abre el panel
            // con el campo "Límite directo". Esto es solo el hint visual.
            <span className={styles.defineHint}>
              <Plus size={11} strokeWidth={2.5} />
              Definir
            </span>
          )}
        </div>
      </div>

      {/* Panel expandido */}
      {isExpanded && (
        <div className={styles.expandPanel}>

          {/* Borrar categoría — un solo camino (antes también había una "×"
              suelta en la fila colapsada, redundante y fácil de tocar sin
              querer). Quita la categoría del todo, no solo el monto. */}
          <div className={styles.deleteRow}>
            <button
              onClick={onRemove}
              className={styles.deleteBtn}
            >
              <Trash2 size={11} /> Quitar categoría
            </button>
          </div>

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

              {/* Total sumado — "presupuestado", no "gastado" (ese ya se ve
                  en la fila colapsada) para no confundir los dos números */}
              <div className={styles.subcatTotal}>
                <span className={styles.subcatTotalLabel}>Total presupuestado</span>
                <span className={styles.subcatTotalValue}>
                  {formatCOP(limite)}
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
    <div className={`tx-row ${styles.subcatRow}`}>
      <input
        className={styles.subcatNameInput}
        value={sub.nombre}
        onChange={e => onNameChange(e.target.value)}
        placeholder="Nombre (ej. Mercado)"
        aria-label="Nombre de la subcategoría"
      />
      <div className={styles.subcatMontoGroup}>
        <span className={styles.subcatCurrencySign} aria-hidden="true">$</span>
        <input
          className={styles.subcatMontoInput}
          value={sub.monto > 0 ? sub.monto.toLocaleString('es-CO') : ''}
          onChange={e => onMontoChange(e.target.value)}
          placeholder="0"
          aria-label="Monto de la subcategoría"
        />
      </div>
      <button onClick={onRemove} aria-label="Eliminar subcategoría" className={`delete-btn ${styles.subcatRemoveBtn}`}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── DirectInput ───────────────────────────────────────────────────────────────

function DirectInput({ value, onChange }: { value: number; onChange: (v: string) => void }) {
  // Antes mostraba los dígitos crudos tal cual se escribían ("1382000"),
  // distinto del resto de inputs de monto en esta misma pantalla (subcats)
  // que sí formatean con separador de miles al escribir.
  const [local, setLocal] = useState(value > 0 ? value.toLocaleString('es-CO') : '')

  return (
    <input
      className={`input-field ${styles.directInputField}`}
      value={local}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '')
        setLocal(digits ? Number(digits).toLocaleString('es-CO') : '')
        onChange(digits)
      }}
      placeholder="0"
      inputMode="numeric"
      data-testid={TEST_IDS.BUDGET_CATEGORY_INPUT}
      aria-label="Monto del presupuesto"
    />
  )
}
