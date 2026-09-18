'use client'

import { useState, useEffect, useCallback } from 'react'
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
}

const ESTADO_COLOR: Record<WeeklyStatus['estado'], string> = {
  verde: 'var(--green)',
  amarillo: 'var(--yellow)',
  rojo: 'var(--red)',
}

const ESTADO_MENSAJE: Record<WeeklyStatus['estado'], string> = {
  verde: 'Vas al ritmo esta semana',
  amarillo: 'Gastando más rápido de lo esperado',
  rojo: 'Sobregiro esta semana',
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
  const promedioDiario = status.diasRestantes > 0 ? Math.max(status.restante / status.diasRestantes, 0) : 0
  const sugerido = status.diasRestantes > 0
    ? `sugerido ${formatCOPCompact(promedioDiario)}/día`
    : 'último día de la semana'

  const arcPct = Math.min(status.pctGastado, 100)
  const dashoffset = CIRC * (1 - arcPct / 100)

  return (
    <div className={styles.root}>
      <p className={styles.label}>Cupo semanal</p>
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
          <span className={styles.amount} style={{ color }}>{formatCOPCompact(status.restante)}</span>
          <span className={styles.estadoMsg} style={{ color }}>{ESTADO_MENSAJE[status.estado]}</span>
          <span className={styles.sugerido}>{sugerido}</span>
        </div>
      </div>
    </div>
  )
}
