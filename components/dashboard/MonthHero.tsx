'use client'

import { useState, useEffect } from 'react'
import { getDaysInMonth, parseISO } from 'date-fns'
import { formatCOPCompact } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import styles from './MonthHero.module.css'

interface Props {
  gastos: number
  mes: string
  /** Cambiar este valor fuerza un refetch del plan mensual (ej. después de guardar el presupuesto) */
  refreshSignal?: number
}

/**
 * Antes esta era la tarjeta hero del dashboard: número enorme, barra,
 * mensaje de pulso. Compitiendo con el anillo del Cupo Semanal (el foco real
 * de "¿cuánto puedo gastar hoy?"), eran dos heroes en la misma pantalla. Ahora
 * es una sola línea de contexto — el mes sigue siendo relevante, pero de
 * fondo, no como protagonista.
 */
export default function MonthHero({ gastos, mes, refreshSignal }: Props) {
  const [ingreso, setIngreso] = useState(0)

  useEffect(() => {
    fetch(`/api/monthly-plan?mes=${mes}`)
      .then(r => r.json())
      .then(d => setIngreso(d.plan?.ingresoNetoMensual ?? 0))
      .catch(() => setIngreso(0))
  }, [mes, refreshSignal])

  const ref = parseISO(`${mes}-01`)
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === ref.getFullYear() && today.getMonth() === ref.getMonth()
  const diasEnMes     = getDaysInMonth(ref)
  const diasRestantes = isCurrentMonth ? diasEnMes - today.getDate() : 0

  const hasIngreso = ingreso > 0
  const over       = hasIngreso && gastos > ingreso
  const restante   = Math.abs(ingreso - gastos)

  if (!hasIngreso) return null

  return (
    <p data-testid={TEST_IDS.DASHBOARD_MONTH_PROGRESS} className={styles.hero} style={over ? { color: 'var(--red)' } : undefined}>
      {over
        ? `Vas ${formatCOPCompact(restante)} sobre tu ingreso este mes`
        : `Gastaste ${formatCOPCompact(gastos)} de ${formatCOPCompact(ingreso)} este mes`}
      {isCurrentMonth && diasRestantes > 0 && ` · ${diasRestantes}d restantes`}
    </p>
  )
}
