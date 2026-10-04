'use client'

// CategoryManager — hoja "Categorías": un solo lugar para decidir cómo cuenta
// cada categoría en tu plan (Variable / Fijo / Ahorro), restaurar el valor
// predeterminado de las que vienen con la app, eliminar las tuyas y crear
// nuevas. Los cambios se guardan al tocar, sin botón de guardar.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import {
  CATEGORIA_CAPA_DEFAULT,
  CATEGORIA_LABELS,
  catLabel,
  formatCOPCompact,
  getCategoryColor,
  type Capa,
  type Categoria,
  type Transaction,
} from '@/lib/types'
import { countedCapa, isBuiltInCategoria, listCustomCategories } from '@/lib/services/layerService'
import { getCategoryIcon } from '@/lib/categoryIcons'
import NewCategoryForm, { CAPA_LABELS, CAPAS_ORDEN } from './NewCategoryForm'
import styles from './CategoryManager.module.css'

interface Props {
  capaOverrides: Record<string, Capa>
  /** Transacciones del mes que se está viendo, para mostrar cuánto suma cada categoría */
  transactions: Transaction[]
  onClose: () => void
  /** transaccionesCambiaron: se eliminó una categoría y sus transacciones pasaron a Otro */
  onChanged: (opts: { transaccionesCambiaron: boolean }) => void
}

const BUILT_IN_EDITABLES = (Object.keys(CATEGORIA_LABELS) as Categoria[])
  .filter(c => CATEGORIA_CAPA_DEFAULT[c] !== null)
const FUERA_DEL_PLAN = (Object.keys(CATEGORIA_LABELS) as Categoria[])
  .filter(c => CATEGORIA_CAPA_DEFAULT[c] === null)

function capaDe(cat: string, overrides: Record<string, Capa>): Capa {
  return overrides[cat] ?? (isBuiltInCategoria(cat) ? CATEGORIA_CAPA_DEFAULT[cat] : null) ?? 'VARIABLE'
}

export default function CategoryManager({ capaOverrides, transactions, onClose, onChanged }: Props) {
  // Copia local para que el cambio se vea al instante; se revierte si falla.
  const [overrides, setOverrides] = useState(capaOverrides)
  const [creadas, setCreadas] = useState<string[]>([])
  const [eliminadas, setEliminadas] = useState<string[]>([])
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const customCats = useMemo(
    () => listCustomCategories(overrides, transactions, creadas).filter(c => !eliminadas.includes(c)),
    [overrides, transactions, creadas, eliminadas]
  )

  const montoMes = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) {
      if (countedCapa(t, overrides)) m.set(t.categoria, (m.get(t.categoria) ?? 0) + Number(t.monto))
    }
    return m
  }, [transactions, overrides])

  const cambiarCapa = async (cat: string, capa: Capa) => {
    const anterior = overrides
    const esDefault = isBuiltInCategoria(cat) && CATEGORIA_CAPA_DEFAULT[cat] === capa
    setError(null)
    setOverrides(prev => {
      const next = { ...prev }
      if (esDefault) delete next[cat]
      else next[cat] = capa
      return next
    })
    try {
      const res = await fetch('/api/category-capas', {
        method: esDefault ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(esDefault ? { categoria: cat } : { categoria: cat, capa }),
      })
      if (!res.ok) throw new Error()
      onChanged({ transaccionesCambiaron: false })
    } catch {
      setOverrides(anterior)
      setError(`No se pudo cambiar ${catLabel(cat)}. Intenta de nuevo.`)
    }
  }

  const eliminar = async (cat: string) => {
    setConfirmando(null)
    setError(null)
    setEliminadas(prev => [...prev, cat])
    try {
      const res = await fetch('/api/category-capas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria: cat }),
      })
      if (!res.ok) throw new Error()
      setOverrides(prev => { const next = { ...prev }; delete next[cat]; return next })
      onChanged({ transaccionesCambiaron: true })
    } catch {
      setEliminadas(prev => prev.filter(c => c !== cat))
      setError(`No se pudo eliminar ${catLabel(cat)}. Intenta de nuevo.`)
    }
  }

  if (typeof document === 'undefined') return null

  const renderRow = (cat: string, custom: boolean) => {
    const Icon = getCategoryIcon(cat)
    const actual = capaDe(cat, overrides)
    const monto = montoMes.get(cat) ?? 0
    const cambiada = !custom && isBuiltInCategoria(cat) && cat in overrides
    const defaultCapa = isBuiltInCategoria(cat) ? CATEGORIA_CAPA_DEFAULT[cat] : null

    if (confirmando === cat) {
      return (
        <li key={cat} className={styles.confirmRow}>
          <p className={styles.confirmText}>
            ¿Eliminar <strong>{catLabel(cat)}</strong>? Sus movimientos pasan a Otro, no se borra ninguno.
          </p>
          <div className={styles.confirmActions}>
            <button className={styles.btnGhost} onClick={() => setConfirmando(null)}>Cancelar</button>
            <button className={styles.btnDanger} onClick={() => eliminar(cat)}>Eliminar</button>
          </div>
        </li>
      )
    }

    return (
      <li key={cat} className={styles.row}>
        <div className={styles.rowTop}>
          <span className={styles.icon} style={{ color: getCategoryColor(cat) }}><Icon size={16} /></span>
          <span className={styles.name}>
            {catLabel(cat)}
            <span className={styles.meta}>
              {monto > 0 ? `${formatCOPCompact(monto)} este mes` : 'Sin gastos este mes'}
              {cambiada && defaultCapa && (
                <>
                  {' · '}
                  <button className={styles.linkBtn} onClick={() => cambiarCapa(cat, defaultCapa)}>
                    Restaurar a {CAPA_LABELS[defaultCapa]}
                  </button>
                </>
              )}
            </span>
          </span>
          {custom && (
            <button
              className={styles.trashBtn}
              onClick={() => setConfirmando(cat)}
              aria-label={`Eliminar categoría ${catLabel(cat)}`}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <div className={styles.segmented} role="radiogroup" aria-label={`Cómo cuenta ${catLabel(cat)} en tu plan`}>
          {CAPAS_ORDEN.map(c => (
            <button
              key={c}
              role="radio"
              aria-checked={actual === c}
              onClick={() => actual !== c && cambiarCapa(cat, c)}
              className={`${styles.segBtn} ${actual === c ? styles[`segOn${c}`] : ''}`}
            >
              {CAPA_LABELS[c]}
            </button>
          ))}
        </div>
      </li>
    )
  }

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Categorías"
        className={styles.sheet}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      >
        <div className={styles.header}>
          <p className={styles.title}>Categorías</p>
          <button onClick={onClose} aria-label="Cerrar" className={styles.closeBtn}><X size={18} /></button>
        </div>
        <p className={styles.intro}>
          Elige cómo cuenta cada categoría en tu plan. <strong>Variable</strong> sale de tu cupo semanal,
          {' '}<strong>Fijo</strong> se compara con tus gastos fijos y <strong>Ahorro</strong> suma a tu meta.
          Los cambios se guardan solos y aplican a todos tus meses.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.sectionLabel}>Nueva categoría</p>
        <NewCategoryForm
          existing={customCats}
          onDone={(key, creada) => {
            if (!creada) return
            setCreadas(prev => [...prev, key])
            onChanged({ transaccionesCambiaron: false })
          }}
        />

        {customCats.length > 0 && (
          <>
            <p className={styles.sectionLabel}>Tus categorías</p>
            <ul className={styles.list}>{customCats.map(c => renderRow(c, true))}</ul>
          </>
        )}

        <p className={styles.sectionLabel}>Predeterminadas</p>
        <ul className={styles.list}>{BUILT_IN_EDITABLES.map(c => renderRow(c, false))}</ul>

        <p className={styles.footnote}>
          {FUERA_DEL_PLAN.map(c => catLabel(c)).join(', ')} no cuentan en tu plan: son entradas,
          plata entre tus cuentas, préstamos o gastos que te devuelven. Las predeterminadas no se
          pueden eliminar porque la app las asigna sola a tus correos.
        </p>
      </div>
    </>,
    document.body
  )
}
