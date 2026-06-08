'use client'

import { useState } from 'react'

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
    if (resetState === 'confirm') {
      handleResetConfirm()
    }
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

  return (
    <div className="flex items-center gap-2">

      {/* Botón principal de sync */}
      {syncState === 'syncing' ? (
        <button disabled className="flex items-center gap-2 text-sm bg-brand-50 text-brand-700 px-4 py-2 rounded-lg">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Sincronizando...
        </button>
      ) : syncState === 'done' && result ? (
        <div className="flex items-center gap-2 text-sm text-brand-700 bg-brand-50 px-4 py-2 rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {result.transacciones_nuevas === 0
            ? 'Al día'
            : `+${result.transacciones_nuevas} transacción${result.transacciones_nuevas !== 1 ? 'es' : ''}`}
        </div>
      ) : syncState === 'error' ? (
        <button onClick={handleSync} className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 px-4 py-2 rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
          </svg>
          Reintentar
        </button>
      ) : (
        <button
          onClick={handleSync}
          disabled={isBusy}
          className="flex items-center gap-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sincronizar
        </button>
      )}

      {/* Botón de reset (papelera) */}
      {resetState === 'resetting' ? (
        <div className="w-8 h-8 flex items-center justify-center">
          <svg className="w-4 h-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : resetState === 'done' ? (
        <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center" title="Datos borrados">
          <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : (
        <button
          onClick={handleResetClick}
          disabled={isBusy || syncState !== 'idle'}
          title={resetState === 'confirm' ? '¿Seguro? Toca de nuevo para confirmar' : 'Borrar todos los datos'}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30 ${
            resetState === 'confirm'
              ? 'bg-rose-100 text-rose-600 hover:bg-rose-200 ring-2 ring-rose-400 ring-offset-1 animate-pulse'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600'
          }`}
        >
          {resetState === 'confirm' ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      )}

    </div>
  )
}
