'use client'

// Formulario para crear una categoría nueva (de día a día: los fijos salen
// de los ítems del plan). Lo usan el selector de categoría de una
// transacción y la hoja de "Categorías".

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { normalizeCatKey, type Capa } from '@/lib/types'
import { isBuiltInCategoria } from '@/lib/services/layerService'
import styles from './NewCategoryForm.module.css'

export const CAPA_LABELS: Record<Capa, string> = { AHORRO: 'Ahorro', FIJO: 'Fijo', VARIABLE: 'Variable' }
export const CAPA_COLOR: Record<Capa, string> = { AHORRO: 'var(--blue)', FIJO: 'var(--purple)', VARIABLE: 'var(--text-muted)' }
/** Registra una categoría nueva y retorna su clave normalizada */
export async function createCategory(nombre: string, capa: Capa = 'VARIABLE'): Promise<string> {
  const key = normalizeCatKey(nombre)
  const res = await fetch('/api/category-capas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoria: key, capa }),
  })
  if (!res.ok) throw new Error('No se pudo crear la categoría')
  return key
}

interface Props {
  /** Categorías que ya existen (custom), para no crear duplicados */
  existing: string[]
  /** Se llama con la clave de la categoría (nueva o ya existente con ese nombre) */
  onDone: (key: string, creada: boolean) => void
}

export default function NewCategoryForm({ existing, onDone }: Props) {
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    const limpio = nombre.trim()
    if (!limpio || creando) return
    const key = normalizeCatKey(limpio)
    if (isBuiltInCategoria(key) || existing.includes(key)) {
      setNombre('')
      onDone(key, false)
      return
    }
    setCreando(true)
    setError(null)
    try {
      await createCategory(limpio)
      setNombre('')
      onDone(key, true)
    } catch {
      setError('No se pudo crear la categoría')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.row}>
        <input
          className="input-field"
          value={nombre}
          onChange={e => { setNombre(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          placeholder="Ej. Mascotas, Deportes, Regalos"
          aria-label="Nombre de la nueva categoría"
          maxLength={30}
        />
        <button
          onClick={handleCreate}
          disabled={!nombre.trim() || creando}
          className={styles.createBtn}
        >
          {creando ? <RefreshCw size={11} className="animate-spin" /> : 'Crear'}
        </button>
      </div>
    </div>
  )
}
