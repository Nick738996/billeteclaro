'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Copy, PiggyBank, Home, Wallet, Plus, Trash2 } from 'lucide-react'
import { formatCOP, type BudgetSubcat } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import FloatingSaveBar from '@/components/ui/FloatingSaveBar'
import styles from './BudgetManager.module.css'

interface PlanEntry {
  ingresoNetoMensual: number
  fijoTotalMonto: number
  ahorroMetaMonto: number
}

interface Props {
  mes: string
  initialPlan?: PlanEntry | null
  /** Suma real de transacciones de tipo INGRESO en el mes — con esto,
   * "Ingreso neto mensual" se llena solo la primera vez en vez de pedirle al
   * usuario que lo digite de memoria. */
  ingresoReal?: number
  onPlanChange?: (plan: PlanEntry) => void
  onSaved?: () => void
  onClose?: () => void
}

function digitsToNumber(value: string): number {
  return parseInt(value.replace(/\D/g, ''), 10) || 0
}

function resolveIngreso(planIngreso: number, ingresoReal: number): string {
  if (planIngreso > 0) return String(planIngreso)
  if (ingresoReal > 0) return String(ingresoReal)
  return ''
}

function formatDigits(value: string): string {
  return value ? digitsToNumber(value).toLocaleString('es-CO') : ''
}

function daysInMonth(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function itemsEqual(a: BudgetSubcat[], b: BudgetSubcat[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// Semáforo de qué tan cerca estás del rango recomendado — antes el % era
// texto plano sin ninguna señal, ahora el color mismo dice si vas bien.
// Ahorro y Variable son "más es igual de bueno" (colorAbove: solo preocupa
// quedar corto); Fijo sí tiene techo real (colorRange: pasarse también
// importa).
function colorAbove(pct: number, min: number): string {
  if (pct >= min) return 'var(--green)'
  return pct < min - 10 ? 'var(--red)' : 'var(--yellow)'
}
function colorRange(pct: number, min: number, max: number): string {
  if (pct >= min && pct <= max) return 'var(--green)'
  if (pct < min) return 'var(--yellow)'
  return pct > max + 15 ? 'var(--red)' : 'var(--yellow)'
}

const EMPTY_PLAN: PlanEntry = { ingresoNetoMensual: 0, fijoTotalMonto: 0, ahorroMetaMonto: 0 }

// ── ItemsEditor — desglose opcional (Ahorro/Fijo) ───────────────────────────
// Sin clasificación, sin badges, sin picker de categorías: solo nombre +
// monto por fila, que suman al total de esa capa. Es una ayuda para llegar
// al número para quien no lo tiene de cabeza, no un presupuesto por
// categoría — esa clasificación vive en la lista de transacciones.
function ItemsEditor({ items, onChange }: { items: BudgetSubcat[]; onChange: (items: BudgetSubcat[]) => void }) {
  const updateItem = (idx: number, field: keyof BudgetSubcat, value: string) => {
    const next = items.map((it, i) =>
      i === idx ? { ...it, [field]: field === 'monto' ? digitsToNumber(value) : value } : it
    )
    onChange(next)
  }
  const addItem = () => onChange([...items, { nombre: '', monto: 0 }])
  const removeItem = (idx: number) => onChange(items.filter((_, i) => i !== idx))

  return (
    <div className={styles.itemsList}>
      {items.map((it, idx) => (
        <div key={idx} className={styles.itemRow}>
          <input
            className={styles.itemNameInput}
            value={it.nombre}
            onChange={e => updateItem(idx, 'nombre', e.target.value)}
            placeholder="Nombre (ej. Arriendo)"
            aria-label="Nombre del ítem"
          />
          <div className={styles.itemMontoGroup}>
            <span className={styles.currencySign}>$</span>
            <input
              className={styles.itemMontoInput}
              value={it.monto > 0 ? it.monto.toLocaleString('es-CO') : ''}
              onChange={e => updateItem(idx, 'monto', e.target.value)}
              placeholder="0"
              inputMode="numeric"
              aria-label="Monto del ítem"
            />
          </div>
          <button onClick={() => removeItem(idx)} aria-label="Eliminar ítem" className={styles.itemRemoveBtn}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button onClick={addItem} className={styles.addItemBtn}>
        <Plus size={11} />
        Agregar ítem
      </button>
    </div>
  )
}

/**
 * Tu plan mensual: 3 números, nada más. Antes esto era una pantalla de
 * presupuesto por categoría — 8+ filas expandibles solo para Gastos Fijos,
 * cada una con su propio badge, subcategorías y picker de categorías —
 * demasiada fricción para algo que se resuelve solo con la clasificación de
 * transacciones (tocar la etiqueta de capa en la lista de transacciones),
 * no presupuestando cada categoría de antemano. Ingreso, Fijo y Ahorro son
 * las únicas 3 decisiones; Variable se deriva y se reparte en el cupo
 * semanal — nunca se declara a mano.
 *
 * Ahorro y Fijo aceptan un desglose OPCIONAL (ItemsEditor): quien no tiene
 * el total de cabeza puede armarlo sumando ítems (arriendo, servicios...)
 * en vez de calcularlo aparte. Sigue siendo un solo número para el resto de
 * la app — los ítems no tienen clasificación propia.
 */
export default function BudgetManager({ mes, initialPlan, ingresoReal = 0, onPlanChange, onSaved, onClose }: Props) {
  const [ingreso, setIngreso] = useState(initialPlan ? resolveIngreso(initialPlan.ingresoNetoMensual, ingresoReal) : '')
  const [fijo,    setFijo]    = useState(initialPlan ? String(initialPlan.fijoTotalMonto) : '')
  const [ahorro,  setAhorro]  = useState(initialPlan ? String(initialPlan.ahorroMetaMonto) : '')
  const [saved,   setSaved]   = useState<PlanEntry>(initialPlan ?? EMPTY_PLAN)
  const [loaded,  setLoaded]  = useState(!!initialPlan)
  const [copying, setCopying] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [savedOk,   setSavedOk]   = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [fijoItems,   setFijoItems]   = useState<BudgetSubcat[]>([])
  const [ahorroItems, setAhorroItems] = useState<BudgetSubcat[]>([])
  const [savedFijoItems,   setSavedFijoItems]   = useState<BudgetSubcat[]>([])
  const [savedAhorroItems, setSavedAhorroItems] = useState<BudgetSubcat[]>([])
  const [fijoDesglose,   setFijoDesglose]   = useState(false)
  const [ahorroDesglose, setAhorroDesglose] = useState(false)

  const [yy, mm] = mes.split('-').map(Number)
  const prevMes = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`

  useEffect(() => {
    if (initialPlan) return
    setLoaded(false)
    fetch(`/api/monthly-plan?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        const plan: PlanEntry = d.plan ?? EMPTY_PLAN
        setSaved(plan)
        setIngreso(resolveIngreso(plan.ingresoNetoMensual, ingresoReal))
        setFijo(plan.fijoTotalMonto > 0 ? String(plan.fijoTotalMonto) : '')
        setAhorro(plan.ahorroMetaMonto > 0 ? String(plan.ahorroMetaMonto) : '')
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [mes])

  // El desglose viaja aparte: initialPlan (la optimización para no re-fetchar
  // cuando CategoriesCard ya tenía los 3 números) nunca trae los ítems, así
  // que esto siempre se busca solo, independiente de si loaded ya era true.
  useEffect(() => {
    fetch(`/api/monthly-plan?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        const fi: BudgetSubcat[] = d.plan?.fijoItems ?? []
        const ai: BudgetSubcat[] = d.plan?.ahorroItems ?? []
        setFijoItems(fi)
        setSavedFijoItems(fi)
        setAhorroItems(ai)
        setSavedAhorroItems(ai)
        if (fi.length > 0) setFijoDesglose(true)
        if (ai.length > 0) setAhorroDesglose(true)
      })
      .catch(() => {})
  }, [mes])

  const current: PlanEntry = {
    ingresoNetoMensual: digitsToNumber(ingreso),
    fijoTotalMonto: digitsToNumber(fijo),
    ahorroMetaMonto: digitsToNumber(ahorro),
  }
  const isDirty = current.ingresoNetoMensual !== saved.ingresoNetoMensual
    || current.fijoTotalMonto !== saved.fijoTotalMonto
    || current.ahorroMetaMonto !== saved.ahorroMetaMonto
    || !itemsEqual(fijoItems, savedFijoItems)
    || !itemsEqual(ahorroItems, savedAhorroItems)

  const handleInput = (field: 'ingreso' | 'fijo' | 'ahorro', raw: string) => {
    if (field === 'ingreso') setIngreso(raw)
    else if (field === 'fijo') setFijo(raw)
    else setAhorro(raw)
    onPlanChange?.({
      ingresoNetoMensual: digitsToNumber(field === 'ingreso' ? raw : ingreso),
      fijoTotalMonto: digitsToNumber(field === 'fijo' ? raw : fijo),
      ahorroMetaMonto: digitsToNumber(field === 'ahorro' ? raw : ahorro),
    })
  }

  const updateItems = (which: 'fijo' | 'ahorro', items: BudgetSubcat[]) => {
    const sum = items.reduce((s, it) => s + it.monto, 0)
    if (which === 'fijo') { setFijoItems(items); setFijo(String(sum)) }
    else { setAhorroItems(items); setAhorro(String(sum)) }
    onPlanChange?.({
      ingresoNetoMensual: digitsToNumber(ingreso),
      fijoTotalMonto: which === 'fijo' ? sum : digitsToNumber(fijo),
      ahorroMetaMonto: which === 'ahorro' ? sum : digitsToNumber(ahorro),
    })
  }

  const startDesglose = (which: 'fijo' | 'ahorro') => {
    const currentVal = digitsToNumber(which === 'fijo' ? fijo : ahorro)
    const seeded: BudgetSubcat[] = [{ nombre: '', monto: currentVal }]
    if (which === 'fijo') { setFijoItems(seeded); setFijoDesglose(true) }
    else { setAhorroItems(seeded); setAhorroDesglose(true) }
  }

  const copyFromPrev = async () => {
    setCopying(true)
    try {
      const res = await fetch(`/api/monthly-plan?mes=${prevMes}`)
      const d = await res.json()
      if (d.plan) {
        setIngreso(String(d.plan.ingresoNetoMensual))
        setFijo(String(d.plan.fijoTotalMonto))
        setAhorro(String(d.plan.ahorroMetaMonto))
        const fi: BudgetSubcat[] = d.plan.fijoItems ?? []
        const ai: BudgetSubcat[] = d.plan.ahorroItems ?? []
        setFijoItems(fi)
        setAhorroItems(ai)
        setFijoDesglose(fi.length > 0)
        setAhorroDesglose(ai.length > 0)
        onPlanChange?.(d.plan)
      }
    } finally {
      setCopying(false)
    }
  }

  const handleSave = async () => {
    if (current.ingresoNetoMensual <= 0) return
    setSaving(true)
    setSavedOk(false)
    setSaveError(null)
    try {
      const res = await fetch('/api/monthly-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes, ...current, fijoItems, ahorroItems }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      setSaved(current)
      setSavedFijoItems(fijoItems)
      setSavedAhorroItems(ahorroItems)
      onPlanChange?.(current)
      setSavedOk(true)
      onSaved?.()
      setTimeout(() => setSavedOk(false), 3000)
    } catch {
      setSaveError('Error al guardar, revisa tu conexión')
    } finally {
      setSaving(false)
    }
  }

  const numWeeks = Math.max(1, Math.round(daysInMonth(mes) / 7))
  const poolVariable = Math.max(0, current.ingresoNetoMensual - current.fijoTotalMonto - current.ahorroMetaMonto)
  const pctDeIngreso = (monto: number) =>
    current.ingresoNetoMensual > 0 ? Math.round((monto / current.ingresoNetoMensual) * 100) : null
  const ahorroPct = pctDeIngreso(current.ahorroMetaMonto)
  const fijoPct = pctDeIngreso(current.fijoTotalMonto)
  const variablePct = pctDeIngreso(poolVariable)

  if (!loaded) return (
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
            <button onClick={onClose} aria-label="Volver al resumen" className={styles.backBtn}>
              <ArrowLeft size={15} />
            </button>
          )}
          <p className={styles.headerTitle}>Tu plan mensual</p>
        </div>
        <div className={styles.headerSub} style={{ paddingLeft: onClose ? 23 : 0 }}>
          <p className={styles.headerHint}>3 números: el resto se calcula solo</p>
          <button onClick={copyFromPrev} disabled={copying} aria-label="Copiar el mes anterior" className={styles.copyBtn}>
            <Copy size={10} />
            {copying ? 'Copiando…' : 'Copiar mes anterior'}
          </button>
        </div>
      </div>

      {/* Ingreso */}
      <div className={styles.planSection}>
        <div className={styles.planLabel}>
          Ingreso neto mensual
          <div className={styles.planInputGroup}>
            <span className={styles.currencySign}>$</span>
            <input
              className={`input-field ${styles.planInputField}`}
              inputMode="numeric"
              placeholder="0"
              value={formatDigits(ingreso)}
              onChange={e => handleInput('ingreso', e.target.value)}
              aria-label="Ingreso neto mensual"
            />
          </div>
        </div>
        {ingresoReal > 0 && digitsToNumber(ingreso) !== ingresoReal && (
          <button onClick={() => handleInput('ingreso', String(ingresoReal))} className={styles.syncIngresoBtn}>
            Usar tus ingresos reales de este mes: {formatCOP(ingresoReal)}
          </button>
        )}
        <p className={styles.planBenchmark}>
          {ingresoReal > 0
            ? 'Se llenó solo con lo que te entró este mes, sin contar retiros de tus ahorros. Si incluye plata que pasaste entre tus propias cuentas, réstala: de este número sale tu cupo semanal.'
            : 'Lo que te queda libre cada mes, después de impuestos.'}
        </p>
      </div>

      {/* Ahorro — un solo total, o desglosado en ítems si lo prefieres */}
      <div className={styles.planSection}>
        <p className={styles.planSectionTitle}>
          <PiggyBank size={14} style={{ color: 'var(--blue)' }} />
          Ahorro
        </p>
        <div className={styles.planLabel}>
          <span className={styles.planLabelRow}>
            Meta este mes
            {ahorroPct !== null && (
              <span className={styles.planPct} style={{ color: colorAbove(ahorroPct, 20) }}>{ahorroPct}% del ingreso</span>
            )}
          </span>
          {ahorroDesglose ? (
            <>
              <ItemsEditor items={ahorroItems} onChange={items => updateItems('ahorro', items)} />
              <div className={styles.itemsTotalRow}>
                <span>Total</span>
                <span>{formatCOP(current.ahorroMetaMonto)}</span>
              </div>
              <button onClick={() => setAhorroDesglose(false)} className={styles.desgloseToggle}>Un solo monto</button>
            </>
          ) : (
            <>
              <div className={styles.planInputGroup}>
                <span className={styles.currencySign}>$</span>
                <input
                  className={`input-field ${styles.planInputField}`}
                  inputMode="numeric"
                  placeholder="0"
                  value={formatDigits(ahorro)}
                  onChange={e => handleInput('ahorro', e.target.value)}
                  aria-label="Meta de ahorro este mes"
                />
              </div>
              <button onClick={() => startDesglose('ahorro')} className={styles.desgloseToggle}>+ Desglosar en ítems</button>
            </>
          )}
        </div>
        <p className={styles.planBenchmark}>
          Dinero que apartas antes de gastar: fondo de emergencia, metas, inversión.
          Recomendado: 20-30% de tu ingreso.
        </p>
      </div>

      {/* Fijo — un solo total, o desglosado en ítems si lo prefieres */}
      <div className={styles.planSection}>
        <p className={styles.planSectionTitle}>
          <Home size={14} style={{ color: 'var(--purple)' }} />
          Gastos Fijos
        </p>
        <div className={styles.planLabel}>
          <span className={styles.planLabelRow}>
            Total este mes
            {fijoPct !== null && (
              <span className={styles.planPct} style={{ color: colorRange(fijoPct, 45, 50) }}>{fijoPct}% del ingreso</span>
            )}
          </span>
          {fijoDesglose ? (
            <>
              <ItemsEditor items={fijoItems} onChange={items => updateItems('fijo', items)} />
              <div className={styles.itemsTotalRow}>
                <span>Total</span>
                <span>{formatCOP(current.fijoTotalMonto)}</span>
              </div>
              <button onClick={() => setFijoDesglose(false)} className={styles.desgloseToggle}>Un solo monto</button>
            </>
          ) : (
            <>
              <div className={styles.planInputGroup}>
                <span className={styles.currencySign}>$</span>
                <input
                  className={`input-field ${styles.planInputField}`}
                  inputMode="numeric"
                  placeholder="0"
                  value={formatDigits(fijo)}
                  onChange={e => handleInput('fijo', e.target.value)}
                  aria-label="Total de gastos fijos este mes"
                />
              </div>
              <button onClick={() => startDesglose('fijo')} className={styles.desgloseToggle}>+ Desglosar en ítems</button>
            </>
          )}
        </div>
        <p className={styles.planBenchmark}>
          Suma lo que pagas sí o sí cada mes: arriendo, servicios, salud prepagada,
          suscripciones, deudas. Recomendado: 45-50% de tu ingreso.
        </p>
      </div>

      {/* Variable — derivado, nunca se declara a mano */}
      <div className={styles.sectionDivider}>
        <p className={styles.sectionDividerLabel}>
          <Wallet size={14} style={{ color: 'var(--text-muted)' }} />
          Gasto Variable
        </p>
        <p className={styles.sectionDividerHint}>
          Todo lo demás: restaurantes, transporte, compras, antojos. No lo declaras arriba,
          es lo que sobra. Recomendado: 25-30% de tu ingreso.
        </p>
      </div>
      <div className={styles.variableSection}>
        {current.ingresoNetoMensual > 0 ? (
          <>
            <div className={styles.variableAmountRow}>
              <span className={styles.variableLabel}>Pool disponible este mes</span>
              {variablePct !== null && (
                <span className={styles.planPct} style={{ color: colorAbove(variablePct, 25) }}>{variablePct}% del ingreso</span>
              )}
            </div>
            <p
              className={styles.variableAmountBig}
              style={{ color: variablePct !== null ? colorAbove(variablePct, 25) : 'var(--text)' }}
            >
              {formatCOP(poolVariable)}
            </p>
            <p className={styles.variableHint}>
              ≈ {formatCOP(Math.round(poolVariable / numWeeks))} por semana ({numWeeks} semanas).
              Revisa tu cupo vivo en la tarjeta de arriba del dashboard.
            </p>
            <p className={styles.variableFootnote}>
              ¿Un gasto en realidad es fijo? Cámbialo desde la lista de transacciones,
              tocando su etiqueta de capa.
            </p>
          </>
        ) : (
          <p className={styles.variableHint}>Define tu ingreso arriba para ver cuánto te queda libre</p>
        )}
      </div>
    </div>

    {/* Floating save bar */}
    {isDirty && (
      <FloatingSaveBar
        label={saveError ?? 'Cambios sin guardar'}
        state={saving ? 'saving' : savedOk ? 'saved' : saveError ? 'error' : 'idle'}
        onDiscard={() => {
          setIngreso(saved.ingresoNetoMensual > 0 ? String(saved.ingresoNetoMensual) : '')
          setFijo(saved.fijoTotalMonto > 0 ? String(saved.fijoTotalMonto) : '')
          setAhorro(saved.ahorroMetaMonto > 0 ? String(saved.ahorroMetaMonto) : '')
          setFijoItems(savedFijoItems)
          setAhorroItems(savedAhorroItems)
          setFijoDesglose(savedFijoItems.length > 0)
          setAhorroDesglose(savedAhorroItems.length > 0)
          setSaveError(null)
          onPlanChange?.(saved)
        }}
        onSave={handleSave}
        saveTestId={TEST_IDS.BUDGET_SAVE_BUTTON}
        saveAriaLabel={saving ? 'Guardando plan' : saveError ? 'Reintentar guardado' : 'Guardar plan'}
      />
    )}
    </>
  )
}
