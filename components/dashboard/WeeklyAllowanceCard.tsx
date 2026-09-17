'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCOPCompact } from '@/lib/types'
import { SegmentedProgressBar } from '@/components/ui/ProgressBar'
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

interface Props {
  /** Cambiar este valor fuerza un refetch (ej. después de agregar una transacción manual) */
  refreshSignal?: number
}

function digitsToNumber(value: string): number {
  return parseInt(value.replace(/\D/g, ''), 10) || 0
}

function formatDigits(value: string): string {
  return value ? digitsToNumber(value).toLocaleString('es-CO') : ''
}

export default function WeeklyAllowanceCard({ refreshSignal }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<WeeklyStatus | null>(null)
  const [hasPlan, setHasPlan] = useState(false)

  const [ingreso, setIngreso] = useState('')
  const [ahorro, setAhorro] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/weekly-allowance')
      .then(r => r.json())
      .then(d => {
        setStatus(d.status ?? null)
        setHasPlan(!!d.hasPlan)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { load() }, [load, refreshSignal])

  const savePlan = async () => {
    const ingresoNum = digitsToNumber(ingreso)
    const ahorroNum = digitsToNumber(ahorro)
    if (ingresoNum <= 0 || !status) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/monthly-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: status.mes, ingresoNetoMensual: ingresoNum, ahorroMetaMonto: ahorroNum }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Error guardando')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className={`card ${styles.loadingWrap}`}>
        <div className={`skeleton ${styles.skeletonTitle}`} />
        <div className={`skeleton ${styles.skeletonAmount}`} />
      </div>
    )
  }

  if (!hasPlan || !status) {
    return (
      <div className={`card ${styles.root}`}>
        <p className={styles.setupTitle}>Configura tu Cupo Semanal</p>
        <p className={styles.setupHint}>
          Dinos tu ingreso neto mensual y cuánto quieres apartar para ahorro; dividimos el resto en
          un cupo semanal para que gastes sin culpa.
        </p>
        <div className={styles.setupFields}>
          <label className={styles.setupLabel}>
            Ingreso neto mensual
            <input
              className="input-field"
              inputMode="numeric"
              placeholder="$0"
              value={formatDigits(ingreso)}
              onChange={e => setIngreso(e.target.value)}
            />
          </label>
          <label className={styles.setupLabel}>
            Meta de ahorro este mes
            <input
              className="input-field"
              inputMode="numeric"
              placeholder="$0"
              value={formatDigits(ahorro)}
              onChange={e => setAhorro(e.target.value)}
            />
          </label>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button onClick={savePlan} disabled={saving || !ingreso} className={styles.setupBtn}>
          {saving ? 'Guardando…' : 'Calcular mi cupo semanal'}
        </button>
      </div>
    )
  }

  const color = ESTADO_COLOR[status.estado]
  const promedioDiario = status.diasRestantes > 0 ? Math.max(status.restante / status.diasRestantes, 0) : 0

  return (
    <div className={`card ${styles.root}`}>
      <p className={styles.label}>Te quedan esta semana</p>
      <p className={styles.hero} style={{ color: status.estado === 'rojo' ? color : 'var(--text)' }}>
        {formatCOPCompact(status.restante)}
      </p>

      <SegmentedProgressBar segments={7} filled={status.diasTranscurridos} color={color} />

      <div className={styles.footer}>
        <p className={styles.micro}>
          {status.diasRestantes > 0
            ? `Para los próximos ${status.diasRestantes} días · sugerido ${formatCOPCompact(promedioDiario)}/día`
            : 'Hoy es el último día de la semana'}
        </p>
        {status.estado === 'rojo' && (
          <span className={styles.badgeRojo}>Sobregiro: se ajusta la próxima semana</span>
        )}
      </div>
    </div>
  )
}
