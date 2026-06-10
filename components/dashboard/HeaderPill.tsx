'use client'

// HeaderPill — Variante B: cápsula unificada con sync + reset + theme + logout
// Reemplaza <SyncButton> + <ThemeToggle> + botón logout en DashboardClient.tsx
// Uso: <HeaderPill onSyncComplete={fn} onSignOut={fn} />

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { RefreshCw, Check, AlertCircle, Trash2, Sun, Moon, LogOut } from 'lucide-react'

interface Props {
  onSyncComplete: () => void
  onSignOut:      () => void
}

type SyncState  = 'idle' | 'syncing' | 'done'  | 'error'
type ResetState = 'idle' | 'confirm' | 'resetting' | 'done'

export default function HeaderPill({ onSyncComplete, onSignOut }: Props) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  const [syncState,   setSyncState]  = useState<SyncState>('idle')
  const [resetState,  setResetState] = useState<ResetState>('idle')
  const [syncResult,  setSyncResult] = useState<{ transacciones_nuevas: number } | null>(null)

  /* ── Sync ──────────────────────────────────────── */
  const handleSync = async () => {
    if (syncState === 'syncing') return
    setSyncState('syncing')
    setSyncResult(null)
    try {
      const res  = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setSyncResult(data)
      setSyncState('done')
      onSyncComplete()
      setTimeout(() => setSyncState('idle'), 5000)
    } catch {
      setSyncState('error')
      setTimeout(() => setSyncState('idle'), 5000)
    }
  }

  /* ── Reset ─────────────────────────────────────── */
  const handleReset = async () => {
    if (resetState === 'idle') {
      setResetState('confirm')
      setTimeout(() => setResetState(s => s === 'confirm' ? 'idle' : s), 4000)
      return
    }
    if (resetState === 'confirm') {
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
  }

  const isBusy = syncState === 'syncing' || resetState === 'resetting'

  /* ── Icon / color helpers ───────────────────────── */
  const syncIcon = syncState === 'syncing'  ? <RefreshCw size={14} className="animate-spin"/>
                 : syncState === 'done'     ? <Check size={14}/>
                 : syncState === 'error'    ? <AlertCircle size={14}/>
                 :                            <RefreshCw size={14}/>

  const syncColor = syncState === 'done'   ? 'var(--green)'
                  : syncState === 'error'  ? 'var(--red)'
                  :                         'var(--text-muted)'

  const syncTitle = syncState === 'done' && syncResult
    ? `+${syncResult.transacciones_nuevas} transacción${syncResult.transacciones_nuevas !== 1 ? 'es' : ''} nueva${syncResult.transacciones_nuevas !== 1 ? 's' : ''}`
    : syncState === 'error' ? 'Error — toca para reintentar' : 'Sincronizar'

  const resetIcon = resetState === 'resetting' ? <RefreshCw size={14} className="animate-spin"/>
                  : resetState === 'done'       ? <Check size={14}/>
                  : resetState === 'confirm'    ? <AlertCircle size={14}/>
                  :                               <Trash2 size={14}/>

  const resetColor = resetState === 'confirm'  ? 'var(--red)'
                   : resetState === 'done'     ? 'var(--green)'
                   :                             'var(--text-muted)'

  const resetTitle = resetState === 'confirm' ? '¿Confirmar? Toca de nuevo para borrar todos los datos'
                   : 'Borrar todos los datos'

  /* ── Divider ────────────────────────────────────── */
  const Divider = () => (
    <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }}/>
  )

  /* ── Single pill button ─────────────────────────── */
  const PillBtn = ({
    onClick, icon, color, disabled = false, title, ariaLabel,
  }: {
    onClick: () => void
    icon: React.ReactNode
    color: string
    disabled?: boolean
    title?: string
    ariaLabel?: string
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        width: 34,
        height: 30,
        borderRadius: 'var(--radius-badge)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        opacity: disabled ? 0.3 : 1,
        transition: 'opacity 0.15s, color 0.15s',
      }}
    >
      {icon}
    </button>
  )

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--pill-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        padding: '0 3px',
        gap: 1,
        height: 36,
        flexShrink: 0,
      }}
    >
      <PillBtn
        onClick={handleSync}
        icon={syncIcon}
        color={syncColor}
        disabled={isBusy}
        title={syncTitle}
        ariaLabel="Sincronizar correos"
      />
      <Divider/>
      <PillBtn
        onClick={handleReset}
        icon={resetIcon}
        color={resetColor}
        disabled={isBusy || syncState !== 'idle'}
        title={resetTitle}
        ariaLabel="Borrar todos los datos"
      />
      <Divider/>
      <PillBtn
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        icon={isDark ? <Sun size={13}/> : <Moon size={13}/>}
        color="var(--text-muted)"
        title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        ariaLabel={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      />
      <Divider/>
      <PillBtn
        onClick={onSignOut}
        icon={<LogOut size={13}/>}
        color="var(--text-muted)"
        title="Cerrar sesión"
        ariaLabel="Cerrar sesión"
      />
    </div>
  )
}
