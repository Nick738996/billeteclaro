'use client'

// HeaderPill — cápsula con theme siempre visible; reset/ayuda/logout/reenvío
// colapsados en un menú "..." para reducir ruido visual en el header.
// (El botón de sincronizar y "Desconectar correo" se quitaron: la ingesta
// ahora es push vía reenvío de correo — no hay tokens OAuth que desconectar
// ni nada que "ir a buscar" con un click — ver lib/services/forwardingService.ts.)

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { RefreshCw, Trash2, Sun, Moon, LogOut, MoreHorizontal, HelpCircle, Mail } from 'lucide-react'
import { TEST_IDS } from '@/lib/testIds'
import styles from './HeaderPill.module.css'

interface Props {
  onSignOut: () => void
  onHelp:    () => void
}

type ResetState = 'idle' | 'confirm' | 'resetting' | 'done'

export default function HeaderPill({ onSignOut, onHelp }: Props) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'

  const [resetState, setResetState] = useState<ResetState>('idle')
  const [menuOpen,   setMenuOpen]   = useState(false)

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

  const isBusy = resetState === 'resetting'
  const resetLabel = resetState === 'confirm' ? '¿Confirmar borrado?' : 'Borrar todos los datos'

  return (
    <div className={styles.pill}>
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
            <button
              role="menuitem"
              className={styles.menuItem}
              onClick={() => { setMenuOpen(false); router.push('/dashboard/forwarding') }}
              data-testid={TEST_IDS.DASHBOARD_FORWARDING_BUTTON}
            >
              <Mail size={14}/>
              Reenvío de correo
            </button>
            <div className={styles.menuDivider} />
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
