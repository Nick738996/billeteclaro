'use client'

// SpendingCard — "En qué se fue". Una lista plana que suma exactamente el
// "Gastaste" de arriba: fijos en una línea (con la lista para chulear al
// tocarla) y luego cada categoría del día a día. Al tocar una fila se abren
// sus movimientos ahí mismo.

import { useState } from 'react'
import { Check, ChevronDown, Circle, Plus, Repeat, Tags } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { catLabel, formatCOPCompact, getCategoryColor, type Transaction } from '@/lib/types'
import { getCategoryIcon } from '@/lib/categoryIcons'
import {
  type MonthSummary,
  type GrupoCategoria,
  type FijosChecklist,
  type PagoRecurrente,
} from '@/lib/services/monthSummary'
import styles from './SpendingCard.module.css'

interface Props {
  summary: MonthSummary
  onManageCategories: () => void
  /** Pagos que se repiten cada mes y no están en el plan */
  recurrentes: PagoRecurrente[]
  onAddToPlan: (p: PagoRecurrente) => Promise<void>
}

function nombre(t: Transaction): string {
  return t.comercio?.trim() || t.descripcion?.trim() || catLabel(t.categoria)
}

function TxList({ txs }: { txs: Transaction[] }) {
  return (
    <ul className={styles.txList}>
      {txs.map(t => (
        <li key={t.id} className={styles.txRow}>
          <span className={styles.txName}>{nombre(t)}</span>
          <span className={styles.txDate}>{formatInTimeZone(new Date(t.fecha), 'America/Bogota', 'd MMM', { locale: es })}</span>
          <span className={styles.txAmount}>{formatCOPCompact(t.monto)}</span>
        </li>
      ))}
    </ul>
  )
}

function CatRow({ g, max, open, onToggle }: {
  g: GrupoCategoria
  max: number
  open: boolean
  onToggle: () => void
}) {
  const Icon = getCategoryIcon(g.categoria)
  const color = getCategoryColor(g.categoria)
  return (
    <li>
      <button className={styles.catRow} onClick={onToggle} aria-expanded={open}>
        <span className={styles.catIcon} style={{ color }}><Icon size={16} /></span>
        <span className={styles.catMain}>
          <span className={styles.catTop}>
            <span className={styles.catName}>{catLabel(g.categoria)}</span>
            <span className={styles.catAmount}>{formatCOPCompact(g.monto)}</span>
          </span>
          <span className={styles.track} aria-hidden="true">
            <span className={styles.fill} style={{ width: `${Math.max(3, (g.monto / max) * 100)}%`, background: color }} />
          </span>
        </span>
        <ChevronDown size={14} className={`${styles.chev} ${open ? styles.chevOpen : ''}`} />
      </button>
      {open && <TxList txs={g.txs} />}
    </li>
  )
}

function Checklist({ c, recurrentes, onAddToPlan }: {
  c: FijosChecklist
  recurrentes: PagoRecurrente[]
  onAddToPlan: (p: PagoRecurrente) => Promise<void>
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [agregando, setAgregando] = useState<string | null>(null)
  return (
    <div className={styles.checklist}>
      <ul className={styles.list}>
        {c.items.map(it => (
          <li key={it.nombre}>
            <button
              className={styles.checkRow}
              onClick={() => it.txs.length > 0 && setAbierto(a => a === it.nombre ? null : it.nombre)}
              aria-expanded={it.txs.length > 0 ? abierto === it.nombre : undefined}
            >
              <span className={`${styles.checkIcon} ${styles[`check_${it.estado}`]}`} aria-label={it.estado}>
                {it.estado === 'pagado' ? <Check size={12} strokeWidth={3} /> : <Circle size={12} />}
              </span>
              <span className={styles.checkMain}>
                <span className={styles.checkName}>{it.nombre}</span>
                <span className={styles.checkMeta}>
                  {it.estado === 'pendiente' && 'Pendiente'}
                  {it.estado === 'parcial' && `Faltan ${formatCOPCompact(it.planeado - it.pagado)}`}
                  {it.estado === 'pagado' && (it.exceso > 0
                    ? <span className={styles.compAlto}>{formatCOPCompact(it.exceso)} más de lo planeado</span>
                    : 'Pagado')}
                </span>
              </span>
              <span className={styles.checkAmount}>
                {it.pagado > 0 ? formatCOPCompact(it.pagado) : formatCOPCompact(it.planeado)}
                {it.pagado > 0 && <span className={styles.checkOf}> de {formatCOPCompact(it.planeado)}</span>}
              </span>
            </button>
            {abierto === it.nombre && <TxList txs={it.txs} />}
          </li>
        ))}
      </ul>

      {c.sinItem.length > 0 && (
        <div className={styles.subBlock}>
          <p className={styles.subTitle}>Fijos que no están en tu plan</p>
          <p className={styles.subHint}>Tócalos en tu lista de movimientos para pasarlos a un ítem de tu plan, o a Variable si no son fijos.</p>
          <TxList txs={c.sinItem} />
        </div>
      )}

      {recurrentes.length > 0 && (
        <div className={styles.subBlock}>
          <p className={styles.subTitle}>Se repiten cada mes y no están en tu plan</p>
          <ul className={styles.list}>
            {recurrentes.map(r => (
              <li key={r.nombre} className={styles.recRow}>
                <span className={styles.checkMain}>
                  <span className={styles.checkName}>{r.nombre}</span>
                  <span className={styles.checkMeta}>{formatCOPCompact(r.monto)} · {r.meses} meses seguidos</span>
                </span>
                <button
                  className={styles.addBtn}
                  disabled={agregando !== null}
                  onClick={async () => { setAgregando(r.nombre); try { await onAddToPlan(r) } finally { setAgregando(null) } }}
                >
                  <Plus size={12} /> {agregando === r.nombre ? 'Agregando…' : 'Agregar al plan'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function SpendingCard({ summary: s, onManageCategories, recurrentes, onAddToPlan }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const toggle = (key: string) => setOpen(prev => prev === key ? null : key)

  const max = Math.max(1, s.fijoReal, ...s.variablePorCategoria.map(g => g.monto))
  const fijoTxs = s.fijoPorCategoria.flatMap(g => g.txs).sort((a, b) => b.monto - a.monto)
  const fijoMeta = s.fijos
    ? `${s.fijos.pagados} de ${s.fijos.items.length} pagados`
    : s.fijoPorCategoria.slice(0, 3).map(g => catLabel(g.categoria).toLowerCase()).join(', ')

  return (
    <section className={`card ${styles.root}`}>
      <div className={styles.header}>
        <p className={styles.title}>En qué se fue</p>
        <button className={styles.manageBtn} onClick={onManageCategories}>
          <Tags size={11} /> Categorías
        </button>
      </div>

      {s.gastado === 0 && !s.fijos ? (
        <p className={styles.empty}>Aún no hay gastos este mes.</p>
      ) : (
        <ul className={styles.list}>
          {(s.fijoReal > 0 || s.fijos) && (
            <li>
              <button className={styles.catRow} onClick={() => toggle('__fijos')} aria-expanded={open === '__fijos'}>
                <span className={styles.catIcon} style={{ color: 'var(--purple)' }}><Repeat size={16} /></span>
                <span className={styles.catMain}>
                  <span className={styles.catTop}>
                    <span className={styles.catName}>Fijos <span className={styles.catMeta}>{fijoMeta}</span></span>
                    <span className={styles.catAmount}>{formatCOPCompact(s.fijoReal)}</span>
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    <span className={styles.fill} style={{ width: `${Math.max(3, (s.fijoReal / max) * 100)}%`, background: 'var(--purple)' }} />
                  </span>
                </span>
                <ChevronDown size={14} className={`${styles.chev} ${open === '__fijos' ? styles.chevOpen : ''}`} />
              </button>
              {open === '__fijos' && (s.fijos
                ? <Checklist c={s.fijos} recurrentes={recurrentes} onAddToPlan={onAddToPlan} />
                : <TxList txs={fijoTxs} />)}
            </li>
          )}

          {s.variablePorCategoria.map(g => (
            <CatRow key={g.categoria} g={g} max={max} open={open === g.categoria} onToggle={() => toggle(g.categoria)} />
          ))}

        </ul>
      )}
    </section>
  )
}
