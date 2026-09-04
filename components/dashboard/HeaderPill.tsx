'use client'

// HeaderPill — cápsula con sync + theme siempre visibles; reset/ayuda/logout
// colapsados en un menú "..." para reducir ruido visual en el header.

import { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { RefreshCw, Check, AlertCircle, Trash2, Sun, Moon, LogOut, MoreHorizontal, HelpCircle, MailX } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TEST_IDS } from '@/lib/testIds'
import styles from './HeaderPill.module.css'

interface Props {
  onSyncComplete: () => void
  onSignOut:      () => void
  onHelp:         () => void
}

type SyncState       = 'idle' | 'syncing' | 'done'  | 'error'
type ResetState      = 'idle' | 'confirm' | 'resetting' | 'done'
type DisconnectState = 'idle' | 'confirm' | 'disconnecting'

export default function HeaderPill({ onSyncComplete, onSignOut, onHelp }: Props) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'

  const [syncState,   setSyncState]  = useState<SyncState>('idle')
  const [resetState,  setResetState] = useState<ResetState>('idle')
  const [disconnectState, setDisconnectState] = useState<DisconnectState>('idle')
  const [syncResult,  setSyncResult] = useState<{ transacciones_nuevas: number } | null>(null)
  const [syncError,   setSyncError]  = useState<string | null>(null)
  const [menuOpen,    setMenuOpen]   = useState(false)
  const [provider,    setProvider]   = useState<'gmail' | 'outlook'>('gmail')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.provider === 'azure') setProvider('outlook')
    })
  }, [])

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const closeOnEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEsc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEsc)
    }
  }, [menuOpen])

  /* ── Sync ──────────────────────────────────────── */
  const needsReconnect = (() => {
    const msg = syncError?.toLowerCase() ?? ''
    return msg.includes('token') || msg.includes('no hay cuenta de correo conectada')
  })()

  const handleSync = async () => {
    if (syncState === 'syncing') return
    if (needsReconnect) {
      window.location.href = `/api/auth/${provider}-connect?next=${encodeURIComponent('/dashboard')}`
      return
    }
    setSyncState('syncing')
    setSyncResult(null)
    setSyncError(null)
    try {
      const res  = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setSyncResult(data)
      setSyncState('done')
      onSyncComplete()
      setTimeout(() => setSyncState('idle'), 5000)
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Error')
      setSyncState('error')
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
        window.location.href = '/onboarding'
      } catch {
        setResetState('idle')
      }
    }
  }

  /* ── Desconectar correo ───────────────────────────── */
  const handleDisconnect = async () => {
    if (disconnectState === 'idle') {
      setDisconnectState('confirm')
      setTimeout(() => setDisconnectState(s => s === 'confirm' ? 'idle' : s), 4000)
      return
    }
    if (disconnectState === 'confirm') {
      setDisconnectState('disconnecting')
      try {
        const res = await fetch('/api/auth/disconnect', { method: 'POST' })
        if (!res.ok) throw new Error('Error al desconectar')
        window.location.href = '/onboarding'
      } catch {
        setDisconnectState('idle')
      }
    }
  }

  const isBusy = syncState === 'syncing' || resetState === 'resetting' || disconnectState === 'disconnecting'

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
    : syncState === 'error' ? (needsReconnect ? `${syncError} — toca para volver a entrar` : `${syncError ?? 'Error'} — toca para reintentar`)
    : 'Sincronizar'

  const resetLabel = resetState === 'confirm' ? '¿Confirmar borrado?' : 'Borrar todos los datos'
  const disconnectLabel = disconnectState === 'confirm' ? '¿Confirmar desconexión?' : 'Desconectar correo'

  return (
    <div className={styles.pill}>
      <button
        onClick={handleSync}
        disabled={isBusy}
        title={syncTitle}
        aria-label="Sincronizar correos"
        data-testid={TEST_IDS.DASHBOARD_SYNC_BUTTON}
        className={isBusy ? `${styles.btn} ${styles.btnDisabled}` : styles.btn}
        style={{ '--clr': syncColor } as React.CSSProperties}
      >
        {syncIcon}
      </button>

      <button
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className={styles.btn}
        style={{ '--clr': 'var(--text-muted)' } as React.CSSProperties}
      >
        {isDark ? <Sun size={13}/> : <Moon size={13}/>}
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <div className={styles.menuWrap} ref={menuRef}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Más opciones"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={styles.btn}
          style={{ '--clr': 'var(--text-muted)' } as React.CSSProperties}
        >
          <MoreHorizontal size={15}/>
        </button>

        {menuOpen && (
          <div className={styles.menu} role="menu">
            <button
              role="menuitem"
              className={styles.menuItem}
              onClick={() => { setMenuOpen(false); onHelp() }}
              data-testid={TEST_IDS.DASHBOARD_HELP_BUTTON}
            >
              <HelpCircle size={14}/>
              Ayuda y tour
            </button>
            <button
              role="menuitem"
              className={styles.menuItem}
              onClick={() => { setMenuOpen(false); onSignOut() }}
              data-testid={TEST_IDS.AUTH_LOGOUT_BUTTON}
            >
              <LogOut size={14}/>
              Cerrar sesión
            </button>
            <div className={styles.menuDivider} />
            <button
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={handleDisconnect}
              disabled={isBusy}
              title="Revoca el acceso a tu correo y borra los tokens guardados"
              data-testid={TEST_IDS.DASHBOARD_DISCONNECT_BUTTON}
            >
              {disconnectState === 'disconnecting' ? <RefreshCw size={14} className="animate-spin"/> : <MailX size={14}/>}
              {disconnectLabel}
            </button>
            <button
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={handleReset}
              disabled={isBusy}
              data-testid={TEST_IDS.DASHBOARD_RESET_BUTTON}
            >
              {resetState === 'resetting' ? <RefreshCw size={14} className="animate-spin"/> : <Trash2 size={14}/>}
              {resetLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
