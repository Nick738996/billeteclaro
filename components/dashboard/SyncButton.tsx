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

export default function SyncButton({ onSyncComplete }: Props) {
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleSync = async () => {
    setState('syncing')
    setResult(null)

    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Error en la sincronización')

      setResult(data)
      setState('done')
      onSyncComplete()

      setTimeout(() => setState('idle'), 5000)
    } catch (err) {
      setState('error')
      setTimeout(() => setState('idle'), 5000)
    }
  }

  if (state === 'syncing') {
    return (
      <button
        disabled
        className="flex items-center gap-2 text-sm bg-brand-50 text-brand-700 px-4 py-2 rounded-lg"
      >
        <svg
          className="w-4 h-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        Sincronizando...
      </button>
    )
  }

  if (state === 'done' && result) {
    return (
      <div className="flex items-center gap-2 text-sm text-brand-700 bg-brand-50 px-4 py-2 rounded-lg">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {result.transacciones_nuevas === 0
          ? 'Al día'
          : `+${result.transacciones_nuevas} transacción${result.transacciones_nuevas !== 1 ? 'es' : ''}`}
      </div>
    )
  }

  if (state === 'error') {
    return (
      <button
        onClick={handleSync}
        className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 px-4 py-2 rounded-lg"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
        </svg>
        Reintentar
      </button>
    )
  }

  return (
    <button
      onClick={handleSync}
      className="flex items-center gap-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white px-4 py-2 rounded-lg transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      Sincronizar
    </button>
  )
}
