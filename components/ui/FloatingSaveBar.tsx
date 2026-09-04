'use client'

import { createPortal } from 'react-dom'
import { Check, RefreshCw } from 'lucide-react'
import styles from './FloatingSaveBar.module.css'

export type SaveBarState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  label: string
  state: SaveBarState
  onDiscard: () => void
  onSave: () => void
  saveTestId?: string
  saveAriaLabel?: string
}

// Compartida por BudgetManager y TransactionsList — misma barra flotante de
// cambios pendientes, antes duplicada con nombres de clase distintos
// (.saveBarWrap / .pendingBarWrap) pero estructura y CSS idénticos.
export default function FloatingSaveBar({ label, state, onDiscard, onSave, saveTestId, saveAriaLabel }: Props) {
  if (typeof document === 'undefined') return null

  const isError = state === 'error'
  const btnClass =
    state === 'saving' ? styles.saveBtnSaving :
    state === 'saved'  ? styles.saveBtnSaved :
    isError            ? styles.saveBtnError : styles.saveBtnNormal

  return createPortal(
    <div className={styles.wrap}>
      <div className={`${styles.bar} ${isError ? styles.barError : ''}`}>
        <span className={isError ? styles.labelError : styles.label}>{label}</span>
        <div className={styles.actions}>
          <button onClick={onDiscard} className={styles.discardBtn}>
            Descartar
          </button>
          <button
            onClick={onSave}
            disabled={state === 'saving'}
            data-testid={saveTestId}
            aria-label={saveAriaLabel}
            className={`${styles.saveBtn} ${btnClass}`}
          >
            {state === 'saving' ? <><RefreshCw size={11} className="animate-spin" /> Guardando…</> :
             state === 'saved'  ? <><Check size={11} /> Guardado</> :
             isError             ? 'Reintentar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
