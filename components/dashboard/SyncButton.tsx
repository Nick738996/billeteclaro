'use client'

import { useState } from 'react'
import { RefreshCw, Check, AlertCircle, Trash2 } from 'lucide-react'

interface SyncResult {
  correos_revisados: number
  transacciones_nuevas: number
  errores: string[]
}

interface Props {
  onSyncComplete: () => void
}

type SyncState = 'idle' | 'syncing' | 'done' | 'error'
type ResetState = 'idle' | 'confirm' | 'resetting' | 'done'

export default function SyncButton({ onSyncComplete }: Props) {
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [resetState, setResetState] = useState<ResetState>('idle')
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleSync = async () => {
    setSyncState('syncing')
    setResult(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error en la sincronización')
      setResult(data)
      setSyncState('done')
      onSyncComplete()
      setTimeout(() => setSyncState('idle'), 5000)
    } catch {
      setSyncState('error')
      setTimeout(() => setSyncState('idle'), 5000)
    }
  }

  const handleResetClick = () => {
    if (resetState === 'idle') {
      setResetState('confirm')
      setTimeout(() => setResetState((s) => s === 'confirm' ? 'idle' : s), 4000)
      return
    }
    if (resetState === 'confirm') handleResetConfirm()
  }

  const handleResetConfirm = async () => {
    setResetState('resetting')
    try {
      const res = await fetch('/api/transactions', { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al borrar')
      setResetState('done')
      onSyncComplete()
      setTimeout(() => setResetState('idle'), 3000)
    } catch {
      setResetState('idle')
    }
  }

  const isBusy = syncState === 'syncing' || resetState === 'resetting'

  const btnBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 'var(--radius-md)',
    transition: 'opacity 0.15s',
    border: 'none',
    cursor: 'pointer',
  }

  return (
    <div className="flex items-center gap-2">

      {syncState === 'syncing' ? (
        <button disabled style={{ ...btnBase, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          <RefreshCw size={14} className="animate-spin" />
          Sincronizando...
        </button>
      ) : syncState === 'done' && result ? (
        <div style={{ ...btnBase, background: 'var(--green-soft)', color: 'var(--green)', cursor: 'default' }}>
          <Check size={14} />
          {result.transacciones_nuevas === 0
            ? 'Al día'
            : `+${result.transacciones_nuevas} nueva${result.transacciones_nuevas !== 1 ? 's' : ''}`}
        </div>
      ) : syncState === 'error' ? (
        <button onClick={handleSync} style={{ ...btnBase, background: 'var(--red-soft)', color: 'var(--red)' }}>
          <AlertCircle size={14} />
          Reintentar
        </button>
      ) : (
        <button
          onClick={handleSync}
          disabled={isBusy}
          style={{
            ...btnBase,
            background: 'var(--text)',
            color: 'var(--bg)',
            opacity: isBusy ? 0.4 : 1,
          }}
        >
          <RefreshCw size={14} />
          Sincronizar
        </button>
      )}

      {/* Botón reset */}
      {resetState === 'resetting' ? (
        <div className="w-8 h-8 flex items-center justify-center">
          <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : resetState === 'done' ? (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'var(--green-soft)', color: 'var(--green)' }}
        >
          <Check size={14} />
        </div>
      ) : (
        <button
          onClick={handleResetClick}
          disabled={isBusy || syncState !== 'idle'}
          title={resetState === 'confirm' ? '¿Seguro? Toca de nuevo para confirmar' : 'Borrar todos los datos'}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
          style={{
            background: resetState === 'confirm' ? 'var(--red-soft)' : 'var(--surface-2)',
            color: resetState === 'confirm' ? 'var(--red)' : 'var(--text-muted)',
            outline: resetState === 'confirm' ? '2px solid var(--red)' : 'none',
            outlineOffset: 2,
          }}
        >
          {resetState === 'confirm' ? <AlertCircle size={14} /> : <Trash2 size={14} />}
        </button>
      )}
    </div>
  )
}
