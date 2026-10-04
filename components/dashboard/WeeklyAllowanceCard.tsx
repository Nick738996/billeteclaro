'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOPCompact } from '@/lib/types'
import styles from './WeeklyAllowanceCard.module.css'

interface WeeklyStatus {
  mes: string
  semanaInicio: string
  semanaFin: string
  cupoBase: number
  ajusteCarryover: number
  cupoTotal: number
  gastado: number
  restante: number
  pctGastado: number
  pctTiempo: number
  diasTranscurridos: number
  diasRestantes: number
  estado: 'verde' | 'amarillo' | 'rojo'
  desglose: { mes: string; dias: number; porDia: number }[]
}

const nombreMes = (mes: string) => format(parseISO(`${mes}-01`), 'MMMM', { locale: es })
const fechaCorta = (d: string) => format(parseISO(d), 'd MMM', { locale: es })

const ESTADO_COLOR: Record<WeeklyStatus['estado'], string> = {
  verde: 'var(--green)',
  amarillo: 'var(--yellow)',
  rojo: 'var(--red)',
}

const ESTADO_MENSAJE: Record<WeeklyStatus['estado'], string> = {
  verde: 'Vas al ritmo esta semana',
  amarillo: 'Gastando más rápido de lo esperado',
  rojo: 'Te pasaste esta semana',
}

interface Props {
  /** Cambiar este valor fuerza un refetch (ej. después de guardar el presupuesto o agregar una transacción) */
  refreshSignal?: number
}

// Geometría del anillo — círculo de progreso. Radio grande + trazo grueso
// para que el monto (lo que de verdad importa) tenga espacio real adentro
// sin tocar el borde del anillo.
const R = 118
const CX = 170
const CY = 170
const SW = 16
const CIRC = 2 * Math.PI * R

/**
 * Un solo anillo como foco central del dashboard — reemplaza la franja
 * compacta (y, antes de eso, el hero grande con barra lineal). El relleno
 * del anillo es el % gastado del cupo semanal.
 *
 * Solo se muestra una vez que hay un plan mensual configurado (ingreso +
 * meta de ahorro) — eso se hace en BudgetManager, no acá.
 */
export default function WeeklyAllowanceCard({ refreshSignal }: Props) {
  const [status, setStatus] = useState<WeeklyStatus | null>(null)
  const [hasPlan, setHasPlan] = useState(false)

  const load = useCallback(() => {
    fetch('/api/weekly-allowance')
      .then(r => r.json())
      .then(d => {
        setStatus(d.status ?? null)
        setHasPlan(!!d.hasPlan)
      })
      .catch(() => { setStatus(null); setHasPlan(false) })
  }, [])

  useEffect(() => { load() }, [load, refreshSignal])

  if (!hasPlan || !status) return null

  const color = ESTADO_COLOR[status.estado]
  const over = status.restante < 0
  const promedioDiario = status.diasRestantes > 0 ? Math.max(status.restante / status.diasRestantes, 0) : 0
  const sugerido = status.diasRestantes === 0
    ? over
      ? 'Hoy cierra la semana, el exceso se descuenta de la próxima'
      : 'Hoy cierra la semana, lo que sobre pasa a la próxima'
    : over
      ? `Se descuenta de la próxima semana`
      : `Unos ${formatCOPCompact(promedioDiario)} por día hasta el domingo`

  const arcPct = Math.min(status.pctGastado, 100)
  const dashoffset = CIRC * (1 - arcPct / 100)

  // Si un mes da mucho más cupo por día que el otro en la misma semana, casi
  // siempre es porque el ingreso de ese mes en el plan está inflado.
  const [a, b] = status.desglose
  const desbalance = a && b && a.porDia > 0 && b.porDia > 0 && Math.max(a.porDia, b.porDia) / Math.min(a.porDia, b.porDia) >= 1.5
  const mesAlto = desbalance ? (a.porDia > b.porDia ? a : b) : null

  return (
    <div className={styles.root}>
      <p className={styles.label}>Disponible esta semana</p>
      <p className={styles.semana}>{fechaCorta(status.semanaInicio)} al {fechaCorta(status.semanaFin)}</p>
      <div className={styles.ringWrap}>
        <svg width="340" height="340" viewBox="0 0 340 340">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={SW} />
          <circle
            cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth={SW}
            strokeDasharray={CIRC} strokeDashoffset={dashoffset} strokeLinecap="round"
            transform={`rotate(-90 ${CX} ${CY})`}
            className={styles.ringFill}
          />
        </svg>
        <div className={styles.ringCenter}>
          <span className={styles.amountLabel}>{over ? 'Te pasaste' : 'Te quedan'}</span>
          <span className={styles.amount} style={{ color }}>{formatCOPCompact(Math.abs(status.restante))}</span>
          <span className={styles.estadoMsg} style={{ color }}>{ESTADO_MENSAJE[status.estado]}</span>
          <span className={styles.sugerido}>{sugerido}</span>
        </div>
      </div>

      {/* El número del centro, desarmado: de dónde sale, línea por línea. */}
      <dl className={styles.receipt} aria-label="Cómo se calcula lo disponible esta semana">
        <div className={styles.receiptRow}>
          <dt>Cupo de esta semana</dt>
          <dd>{formatCOPCompact(status.cupoBase)}</dd>
        </div>
        {status.desglose.map(t => (
          <div key={t.mes} className={styles.receiptSub}>
            <dt>{t.dias} {t.dias === 1 ? 'día' : 'días'} de {nombreMes(t.mes)} × {formatCOPCompact(t.porDia)}</dt>
            <dd />
          </div>
        ))}
        {status.ajusteCarryover !== 0 && (
          <div className={styles.receiptRow}>
            <dt>{status.ajusteCarryover > 0 ? '+ Te sobró la semana pasada' : '− Te pasaste la semana pasada'}</dt>
            <dd>{formatCOPCompact(Math.abs(status.ajusteCarryover))}</dd>
          </div>
        )}
        <div className={styles.receiptRow}>
          <dt>− Gasto variable hasta hoy</dt>
          <dd>{formatCOPCompact(status.gastado)}</dd>
        </div>
        <div className={`${styles.receiptRow} ${styles.receiptTotal}`}>
          <dt>= {over ? 'Te pasaste' : 'Te quedan'}</dt>
          <dd style={{ color }}>{formatCOPCompact(Math.abs(status.restante))}</dd>
        </div>
      </dl>
      <p className={styles.receiptNote}>
        Tu cupo por día es (ingreso − fijos − ahorro) ÷ días del mes, según el plan de cada mes.
        Solo cuenta gasto Variable: arriendo, suscripciones y demás fijos no salen de aquí.
      </p>
      {mesAlto && (
        <p className={styles.receiptWarn}>
          {nombreMes(mesAlto.mes)} te da {formatCOPCompact(mesAlto.porDia)} por día, mucho más que el otro mes.
          Revisa que el ingreso de ese plan sea real (sin retiros de ahorros ni plata entre tus cuentas).
        </p>
      )}
    </div>
  )
}
