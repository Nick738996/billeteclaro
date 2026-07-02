'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Info, Check } from 'lucide-react'
import {
  CATEGORIA_COLORS,
  getCategoryColor,
  PRESUPUESTO_CATS,
  formatCOPCompact,
  catLabel,
  type Categoria,
  type BudgetEntry,
} from '@/lib/types'
import BudgetManager from './BudgetManager'
import styles from './BudgetOverview.module.css'

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

function zoneColor(pct: number): string {
  if (pct >= 110) return 'var(--red)'
  if (pct >= 80 && pct < 100) return 'var(--yellow)'
  return 'var(--green)'  // <80% saludable  ó  100-109% completado
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
    <div className={`card ${styles.skeletonWrap}`}>
      <div className={`skeleton ${styles.skeletonTitle}`} />
      {[80, 60, 90].map((w, i) => (
        <div key={i} className={styles.skeletonItem}>
          <div className={`skeleton ${styles.skeletonItemLabel}`} style={{ '--skel-w': `${w}%` } as React.CSSProperties} />
          <div className={`skeleton ${styles.skeletonItemBar}`} />
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
      <div className={`card ${styles.cardOverflow}`}>

        {/* Header */}
        <div className={`${styles.header} ${hasContent ? styles.headerBordered : ''}`}>
          <p className={styles.headerTitle}>Presupuesto</p>
          <button onClick={() => setEditing(true)} className={styles.editBtn}>
            <Pencil size={11} />
            Editar
          </button>
        </div>

        {/* Empty state */}
        {!hasContent && (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Sin transacciones este mes</p>
            <button onClick={() => setEditing(true)} className={styles.emptyBtn}>
              Configurar presupuesto
            </button>
          </div>
        )}

        {/* Rows with budget */}
        {sorted.map((cat, i) => {
          const gasto  = gastosPorCategoria[cat] ?? 0
          const limite = budgets[cat] ?? 0
          const pct    = limite > 0 ? (gasto / limite) * 100 : 0
          const dot    = getCategoryColor(cat)
          const color  = zoneColor(pct)
          const badge  = zoneColor(pct)

          return (
            <div
              key={cat}
              className={`${styles.row} ${i < sorted.length - 1 ? styles.rowBorder : ''}`}
            >
              {/* Name + amounts */}
              <div className={styles.rowMeta}>
                <span className={styles.dot} style={{ '--dot-color': dot } as React.CSSProperties} />
                <span className={styles.catName}>{catLabel(cat)}</span>
                <span className={styles.amounts}>
                  <span className={styles.spent}>{formatCOPCompact(gasto)}</span>
                  <span className={styles.limit}> / {formatCOPCompact(limite)}</span>
                </span>
                <span
                  className={styles.pct}
                  style={{ '--pct-color': badge } as React.CSSProperties}
                >
                  {pct >= 110 ? `+${Math.round(pct - 100)}%` : pct >= 100 ? <Check size={13} strokeWidth={2.5} /> : `${Math.round(pct)}%`}
                </span>
              </div>

              {/* Bar */}
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ '--bar-w': `${Math.min(pct, 100)}%`, '--bar-color': color } as React.CSSProperties}
                />
              </div>
            </div>
          )
        })}

        {/* Sin presupuesto — separador */}
        {noBudget.length > 0 && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Sin presupuesto</p>
          </div>
        )}
        {noBudget.map((cat, i) => {
          const gasto = gastosPorCategoria[cat] ?? 0
          const pct   = (gasto / maxGasto) * 100
          return (
            <div key={cat} className={`${styles.row} ${i < noBudget.length - 1 ? styles.rowBorder : ''}`}>
              <div className={styles.rowMeta}>
                <span className={styles.dot} style={{ '--dot-color': getCategoryColor(cat) } as React.CSSProperties} />
                <span className={styles.catName}>{catLabel(cat)}</span>
                <span className={styles.amountOnly}>{formatCOPCompact(gasto)}</span>
                <span className={styles.dash}>—</span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFillGray}
                  style={{ '--bar-w': `${pct}%` } as React.CSSProperties}
                />
              </div>
            </div>
          )
        })}

        {/* Sin categoría — TRANSFERENCIA */}
        {sinCategoria.length > 0 && (
          <div className={styles.sectionWithIcon}>
            <p className={styles.sectionLabel}>Sin categoría</p>
            <span
              className={styles.infoIcon}
              title="Transferencias — considera recategorizarlas en la lista de movimientos"
            >
              <Info size={10} />
            </span>
          </div>
        )}
        {sinCategoria.map((cat, i) => {
          const gasto = gastosPorCategoria[cat] ?? 0
          const pct   = (gasto / maxGasto) * 100
          return (
            <div key={cat} className={`${styles.row} ${i < sinCategoria.length - 1 ? styles.rowBorder : ''}`}>
              <div className={styles.rowMeta}>
                <span className={styles.dot} style={{ '--dot-color': getCategoryColor(cat) } as React.CSSProperties} />
                <span className={styles.catName}>{catLabel(cat)}</span>
                <span className={styles.amountOnly}>{formatCOPCompact(gasto)}</span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFillGray}
                  style={{ '--bar-w': `${pct}%` } as React.CSSProperties}
                />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
