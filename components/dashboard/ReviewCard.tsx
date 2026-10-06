'use client'

// ReviewCard — "Por revisar". Las pocas transacciones que la app no puede
// interpretar sola y que mueven los números: transferencias que te llegaron
// (¿ingreso, te pagaron algo, o es plata tuya?) y salidas grandes sin
// categoría clara. Una respuesta de un toque y desaparecen.

import { useState } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import {
  formatCOPCompact,
  SUBCATEGORIA_CONFIRMADO,
  type Transaction,
} from '@/lib/types'
import type { MotivoRevision } from '@/lib/services/monthSummary'
import styles from './ReviewCard.module.css'

interface Props {
  items: { tx: Transaction; motivo: MotivoRevision }[]
  onChanged: () => void
}

type Patch = { categoria?: string; subcategoria?: string }

const OPCIONES: Record<MotivoRevision, { label: string; patch: (t: Transaction) => Patch }[]> = {
  ENTRADA: [
    { label: 'Es ingreso', patch: () => ({ subcategoria: SUBCATEGORIA_CONFIRMADO }) },
    { label: 'Me pagaron lo que me debían', patch: () => ({ categoria: 'PRESTAMO' }) },
    { label: 'Entre mis cuentas', patch: () => ({ categoria: 'ENTRE_CUENTAS' }) },
    { label: 'Me devolvieron un gasto', patch: () => ({ categoria: 'REEMBOLSABLE' }) },
  ],
  SALIDA_GRANDE: [
    // Una transferencia sin categoría no suma como gasto; "Es un gasto" la pasa a Otro.
    { label: 'Es un gasto', patch: t => ({ categoria: t.categoria === 'TRANSFERENCIA' ? 'OTRO' : t.categoria, subcategoria: SUBCATEGORIA_CONFIRMADO }) },
    { label: 'Préstamo que hice', patch: () => ({ categoria: 'PRESTAMO' }) },
    { label: 'Entre mis cuentas', patch: () => ({ categoria: 'ENTRE_CUENTAS' }) },
    { label: 'Fue a mi ahorro', patch: () => ({ categoria: 'AHORROS' }) },
  ],
}

function nombre(t: Transaction): string {
  return t.comercio?.trim() || (t.contraparte_id ? `la cuenta ${t.contraparte_id}` : 'alguien')
}

export default function ReviewCard({ items, onChanged }: Props) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (items.length === 0) return null

  const responder = async (t: Transaction, patch: Patch) => {
    setSaving(t.id)
    setError(null)
    try {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, ...patch }),
      })
      if (!res.ok) throw new Error()
      onChanged()
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className={`card ${styles.root}`}>
      <p className={styles.title}>Por revisar <span className={styles.count}>{items.length}</span></p>
      <p className={styles.intro}>Responde para que tus números sean reales. Solo te preguntamos una vez.</p>
      {error && <p className={styles.error}>{error}</p>}
      <ul className={styles.list}>
        {items.map(({ tx: t, motivo }) => (
          <li key={t.id} className={styles.item} aria-busy={saving === t.id}>
            <p className={styles.question}>
              {motivo === 'ENTRADA'
                ? <>Te llegaron <strong>{formatCOPCompact(t.monto)}</strong> de {nombre(t)}. ¿Qué es?</>
                : <>Salieron <strong>{formatCOPCompact(t.monto)}</strong> a {nombre(t)}. ¿Qué fue?</>}
            </p>
            <p className={styles.date}>{formatInTimeZone(new Date(t.fecha), 'America/Bogota', "d 'de' MMMM", { locale: es })}</p>
            <div className={styles.options}>
              {OPCIONES[motivo].map(o => (
                <button
                  key={o.label}
                  className={styles.option}
                  disabled={saving !== null}
                  onClick={() => responder(t, o.patch(t))}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
