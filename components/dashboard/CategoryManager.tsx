'use client'

// CategoryManager — hoja "Categorías". Ya no se elige Fijo/Variable/Ahorro
// por categoría: los fijos son los ítems del desglose del plan (se editan en
// "Editar plan") y todo lo demás es día a día. Aquí solo se crean y eliminan
// categorías propias.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import {
  CATEGORIA_CAPA_DEFAULT,
  CATEGORIA_LABELS,
  catLabel,
  formatCOPCompact,
  getCategoryColor,
  isIngreso,
  type Categoria,
  type Transaction,
} from '@/lib/types'
import { listCustomCategories } from '@/lib/services/layerService'
import { getCategoryIcon } from '@/lib/categoryIcons'
import NewCategoryForm from './NewCategoryForm'
import styles from './CategoryManager.module.css'

interface Props {
  /** Categorías creadas por el usuario */
  categoriasPropias: string[]
  /** Categorías que salen de los ítems de fijos del plan del mes */
  planCats: string[]
  /** Transacciones del mes que se está viendo, para mostrar cuánto suma cada categoría */
  transactions: Transaction[]
  onClose: () => void
  /** transaccionesCambiaron: se eliminó una categoría y sus transacciones pasaron a Otro */
  onChanged: (opts: { transaccionesCambiaron: boolean }) => void
}

const NO_CUENTAN = (Object.keys(CATEGORIA_LABELS) as Categoria[]).filter(c => CATEGORIA_CAPA_DEFAULT[c] === null)

export default function CategoryManager({ categoriasPropias, planCats, transactions, onClose, onChanged }: Props) {
  const [creadas, setCreadas] = useState<string[]>([])
  const [eliminadas, setEliminadas] = useState<string[]>([])
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const planSet = useMemo(() => new Set(planCats), [planCats])
  const propias = useMemo(
    () => listCustomCategories({}, transactions, [...categoriasPropias, ...creadas])
      .filter(c => !eliminadas.includes(c) && !planSet.has(c)),
    [categoriasPropias, transactions, creadas, eliminadas, planSet]
  )

  const montoMes = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) {
      if (isIngreso(t.tipo)) continue
      m.set(t.categoria, (m.get(t.categoria) ?? 0) + Number(t.monto))
    }
    return m
  }, [transactions])

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
      onChanged({ transaccionesCambiaron: true })
    } catch {
      setEliminadas(prev => prev.filter(c => c !== cat))
      setError(`No se pudo eliminar ${catLabel(cat)}. Intenta de nuevo.`)
    }
  }

  if (typeof document === 'undefined') return null

  const fila = (cat: string, borrable: boolean) => {
    const Icon = getCategoryIcon(cat)
    const monto = montoMes.get(cat) ?? 0
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
            <span className={styles.meta}>{monto > 0 ? `${formatCOPCompact(monto)} este mes` : 'Sin movimientos este mes'}</span>
          </span>
          {borrable && (
            <button className={styles.trashBtn} onClick={() => setConfirmando(cat)} aria-label={`Eliminar categoría ${catLabel(cat)}`}>
              <Trash2 size={15} />
            </button>
          )}
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
          <strong>Tus fijos son los ítems de tu plan</strong> (arriendo, gym…) y se cambian en &quot;Editar plan&quot;.
          {' '}Todas las demás categorías son <strong>día a día</strong>, y los gastos grandes que no se repiten
          se separan solos como <strong>imprevistos</strong>.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.sectionLabel}>Nueva categoría</p>
        <NewCategoryForm
          existing={propias}
          onDone={(key, creada) => {
            if (!creada) return
            setCreadas(prev => [...prev, key])
            onChanged({ transaccionesCambiaron: false })
          }}
        />

        {propias.length > 0 && (
          <>
            <p className={styles.sectionLabel}>Tus categorías · día a día</p>
            <ul className={styles.list}>{propias.map(c => fila(c, true))}</ul>
          </>
        )}

        {planCats.length > 0 && (
          <>
            <p className={styles.sectionLabel}>De tu plan · fijos</p>
            <ul className={styles.list}>{planCats.map(c => fila(c, false))}</ul>
          </>
        )}

        <p className={styles.footnote}>
          {NO_CUENTAN.map(c => catLabel(c)).join(', ')} no cuentan como gasto: son entradas, plata entre
          tus cuentas, préstamos o gastos que te devuelven. Ahorros e Inversión cuentan como ahorro. Las
          categorías predeterminadas no se pueden eliminar porque la app las asigna sola a tus correos.
        </p>
      </div>
    </>,
    document.body
  )
}
