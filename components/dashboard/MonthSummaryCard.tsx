'use client'

// MonthSummaryCard — la pantalla principal, cada número una sola vez:
//   1. Esta semana: cuánto te queda para el día a día. Cada lunes se
//      recalcula con lo que queda del mes, así un mes que empezó mal se
//      arregla a mitad de camino en vez de "el otro mes empiezo de nuevo".
//   2. Imprevistos: lo gastado contra lo reservado. Es donde se rompía el plan.
//   3. Ahorro: lo que metiste y lo que tuviste que sacar. Sacar es la señal
//      de que algo no estaba en el plan; no agranda el presupuesto.
// Antes había un "Este mes $8,7 M de $14,3 M" (presupuesto inflado por los
// retiros, más grande que lo que entró) y Gastaste/Sacaste repetidos.

import { useState } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { formatCOP, formatCOPCompact, isIngreso, SUBCATEGORIA_RETIRO_AHORROS, type Transaction } from '@/lib/types'
import type { MonthSummary } from '@/lib/services/monthSummary'
import { TEST_IDS } from '@/lib/testIds'
import SavingsOverview from './SavingsOverview'
import styles from './MonthSummaryCard.module.css'

interface Props {
  summary: MonthSummary
  hasPlan: boolean
  isCurrent: boolean
  onEditPlan: () => void
  /** Si este mes no tiene plan pero el anterior sí: usarlo con un toque */
  planAnterior: { mesLabel: string; usar: () => Promise<void> } | null
  onSavingsTransaction: () => void
  savingsRefreshSignal: number
}

const fecha = (t: Transaction) => formatInTimeZone(new Date(t.fecha), 'America/Bogota', 'd MMM', { locale: es })

function TxList({ txs, color, signo }: { txs: Transaction[]; color?: string; signo?: string }) {
  return (
    <ul className={styles.txList}>
      {txs.map(t => (
        <li key={t.id} className={styles.txRow}>
          <span className={styles.txName}>{t.comercio ?? 'Movimiento'}</span>
          <span className={styles.txDate}>{fecha(t)}</span>
          <span className={styles.txAmount} style={color ? { color } : undefined}>{signo}{formatCOPCompact(t.monto)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function MonthSummaryCard({
  summary: s, hasPlan, isCurrent, onEditPlan, planAnterior, onSavingsTransaction, savingsRefreshSignal,
}: Props) {
  const [abierto, setAbierto] = useState<'imprevistos' | 'ahorro' | null>(null)
  const toggle = (k: 'imprevistos' | 'ahorro') => setAbierto(a => a === k ? null : k)
  const [copiando, setCopiando] = useState(false)
  const [errorCopia, setErrorCopia] = useState<string | null>(null)

  const retiros = s.ahorroTxs.filter(t => isIngreso(t.tipo) && t.subcategoria === SUBCATEGORIA_RETIRO_AHORROS)
  const quedaSemana = s.presupuestoSemana - s.gastoSemana
  const sinPresupuesto = s.presupuestoSemana <= 0
  const semanaPct = s.presupuestoSemana > 0 ? Math.min(100, (s.gastoSemana / s.presupuestoSemana) * 100) : 100
  const semanaColor = quedaSemana < 0 || sinPresupuesto ? 'var(--red)' : semanaPct >= 85 ? 'var(--yellow)' : 'var(--green)'
  const imprevOver = s.imprevistosReal > s.imprevistosPlan
  const faltaApartar = isCurrent && s.metaAhorro > 0 && s.recibido > 0 ? Math.max(0, s.metaAhorro - s.aportes) : 0

  if (!hasPlan) {
    return (
      <section className={`card ${styles.root}`} data-testid={TEST_IDS.DASHBOARD_MONTH_PROGRESS}>
        {planAnterior ? (
          <>
            <p className={styles.hint}>Este mes aún no tiene plan. Usa el de {planAnterior.mesLabel} y ajústalo después si cambió algo.</p>
            {errorCopia && <p className={styles.error}>{errorCopia}</p>}
            <div className={styles.actions}>
              <button
                className={styles.primaryBtn}
                disabled={copiando}
                onClick={async () => {
                  setCopiando(true)
                  setErrorCopia(null)
                  try { await planAnterior.usar() } catch { setErrorCopia('No se pudo copiar el plan. Intenta de nuevo.') } finally { setCopiando(false) }
                }}
              >
                {copiando ? 'Copiando…' : `Usar el plan de ${planAnterior.mesLabel}`}
              </button>
              <button className={styles.secondaryBtn} onClick={onEditPlan}>Hacer uno nuevo</button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.hint}>Arma tu plan: cuánto te entra, cuánto ahorras primero, tus fijos e imprevistos. Lo que queda es tu presupuesto de cada semana.</p>
            <button className={styles.primaryBtn} onClick={onEditPlan}>Armar mi plan</button>
          </>
        )}
      </section>
    )
  }

  return (
    <section className={`card ${styles.root}`} data-testid={TEST_IDS.DASHBOARD_MONTH_PROGRESS}>
      {/* 1. Esta semana */}
      <div className={styles.weekHead}>
        <span className={styles.weekLabel}>
          {!isCurrent ? 'Así cerró el mes' : sinPresupuesto ? 'Esta semana' : quedaSemana < 0 ? 'Esta semana te pasaste' : 'Esta semana te quedan'}
        </span>
        <button className={styles.editBtn} onClick={onEditPlan}><Pencil size={11} /> Plan</button>
      </div>
      {isCurrent && (
        <>
          <p className={styles.weekAmount} style={{ color: semanaColor }}>
            {sinPresupuesto ? 'Sin presupuesto' : formatCOP(Math.abs(quedaSemana))}
          </p>
          {!sinPresupuesto && (
            <div className={styles.track} aria-hidden="true">
              <span className={styles.fill} style={{ width: `${semanaPct}%`, background: semanaColor }} />
            </div>
          )}
          <p className={styles.weekSub}>
            {sinPresupuesto
              ? <>Este mes ya no queda para el día a día. Lo que gastes desde hoy saldría de tus ahorros: quédate en lo necesario. Tu ritmo planeado es {formatCOPCompact(s.ritmoPlanSemana)} por semana.</>
              : <>Llevas {formatCOPCompact(s.gastoSemana)} de {formatCOPCompact(s.presupuestoSemana)} en el día a día.
                {s.mesFueraDelPlan
                  ? ` Es menos que tu ritmo planeado (${formatCOPCompact(s.ritmoPlanSemana)}) porque el mes se pasó antes: así lo recuperas sin sacar de tus ahorros.`
                  : ' El lunes empieza una semana nueva.'}</>}
          </p>
        </>
      )}

      {/* 2. Imprevistos */}
      {(s.imprevistosPlan > 0 || s.imprevistosReal > 0) && (
        <>
          <button className={styles.row} onClick={() => toggle('imprevistos')} aria-expanded={abierto === 'imprevistos'}>
            <span className={styles.rowLabel}>Imprevistos</span>
            <span className={styles.rowValue}>
              <strong style={imprevOver ? { color: 'var(--red)' } : undefined}>{formatCOPCompact(s.imprevistosReal)}</strong> de {formatCOPCompact(s.imprevistosPlan)} reservados
            </span>
            <ChevronDown size={14} className={`${styles.chev} ${abierto === 'imprevistos' ? styles.chevOpen : ''}`} />
          </button>
          {imprevOver && (
            <p className={styles.rowNote}>Te pasaste {formatCOPCompact(s.imprevistosReal - s.imprevistosPlan)}: eso sale de tu día a día del mes.</p>
          )}
          {abierto === 'imprevistos' && (s.imprevistosTxs.length > 0
            ? <TxList txs={s.imprevistosTxs} />
            : <p className={styles.rowNote}>Aún no hay imprevistos este mes.</p>)}
        </>
      )}

      {/* 3. Ahorro */}
      <button className={styles.row} onClick={() => toggle('ahorro')} aria-expanded={abierto === 'ahorro'}>
        <span className={styles.rowLabel}>Ahorro</span>
        <span className={styles.rowValue}>
          metiste <strong style={{ color: 'var(--green)' }}>{formatCOPCompact(s.aportes)}</strong>
          {s.retiros > 0 && <> · sacaste <strong style={{ color: 'var(--red)' }}>{formatCOPCompact(s.retiros)}</strong></>}
        </span>
        <ChevronDown size={14} className={`${styles.chev} ${abierto === 'ahorro' ? styles.chevOpen : ''}`} />
      </button>
      {faltaApartar > 0 ? (
        <p className={styles.rowNoteWarn}>Te falta apartar {formatCOPCompact(faltaApartar)} de tu meta: hazlo hoy, antes de gastar.</p>
      ) : s.retiros > 0 ? (
        <p className={styles.rowNoteWarn}>Sacar de tus ahorros es la señal de que algo no estaba en el plan. Ábrelo para ver qué fue.</p>
      ) : null}
      {abierto === 'ahorro' && (
        <>
          {retiros.length > 0 && (
            <>
              <p className={styles.subTitle}>Lo que sacaste</p>
              <TxList txs={retiros} color="var(--red)" signo="−" />
            </>
          )}
          <div className={styles.bolsillos}>
            <SavingsOverview onTransaction={onSavingsTransaction} refreshSignal={savingsRefreshSignal} />
          </div>
        </>
      )}
    </section>
  )
}
