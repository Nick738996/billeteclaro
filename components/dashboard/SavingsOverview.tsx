'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, ChevronDown, Minus, Plus, RefreshCw } from 'lucide-react'
import { formatCOPCompact } from '@/lib/types'
import SavingsManager from './SavingsManager'
import type { SavingsAccount } from '@/lib/services/savingsService'
import styles from './SavingsOverview.module.css'

type ActionMode = 'withdraw' | 'deposit'

interface Action {
  accountId: string
  mode: ActionMode
}

const ACTION_COPY: Record<ActionMode, { endpoint: string; hint: (nombre: string) => string; confirmLabel: string; confirmingLabel: string }> = {
  withdraw: {
    endpoint: '/api/savings/withdraw',
    hint: nombre => `Este monto se descuenta de ${nombre} y aparece como ingreso disponible hoy.`,
    confirmLabel: 'Confirmar retiro',
    confirmingLabel: 'Retirando…',
  },
  deposit: {
    endpoint: '/api/savings/deposit',
    hint: nombre => `Este monto se suma a ${nombre} y queda registrado como transferencia a ahorros hoy.`,
    confirmLabel: 'Confirmar aporte',
    confirmingLabel: 'Aportando…',
  },
}

interface Props {
  onTransaction?: () => void
  /** Cambiar este valor fuerza un refetch — usar cuando algo fuera de este
   * componente (ej. borrar una transacción en la lista) pudo haber cambiado
   * un saldo de ahorro (ver reversión en deleteTransaction). */
  refreshSignal?: number
}

export default function SavingsOverview({ onTransaction, refreshSignal }: Props) {
  const [accounts, setAccounts] = useState<SavingsAccount[]>([])
  const [loaded,   setLoaded]   = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [action,   setAction]   = useState<Action | null>(null)
  const [amount,   setAmount]   = useState('')
  const [busy,     setBusy]     = useState(false)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/savings')
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { load() }, [load, refreshSignal])

  const openAction = (accountId: string, mode: ActionMode) => {
    setAction({ accountId, mode })
    setAmount('')
    setActionErr(null)
  }

  const closeAction = () => {
    setAction(null)
    setAmount('')
    setActionErr(null)
  }

  const confirmAction = async () => {
    if (!action || busy) return
    const monto = parseInt(amount.replace(/\D/g, ''), 10) || 0
    if (monto <= 0) return

    if (action.mode === 'withdraw') {
      const account = accounts.find(a => a.id === action.accountId)
      if (account && monto > account.saldo) {
        setActionErr('El monto supera el saldo disponible en esa cuenta')
        return
      }
    }

    setBusy(true)
    setActionErr(null)
    try {
      const res = await fetch(ACTION_COPY[action.mode].endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: action.accountId, monto }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Error guardando')
      setAccounts(body.accounts ?? [])
      closeAction()
      onTransaction?.()
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const total = accounts.reduce((s, a) => s + a.saldo, 0)

  if (!loaded) return (
    <div className={`card ${styles.loadingWrap}`}>
      <div className={`skeleton ${styles.skeletonTitle}`} />
      {[75, 55].map((w, i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={`skeleton ${styles.skeletonLine}`} style={{ '--w': `${w}%` } as React.CSSProperties} />
        </div>
      ))}
    </div>
  )

  if (editing) {
    return (
      <SavingsManager
        initialAccounts={accounts}
        onSaved={saved => { setAccounts(saved); setEditing(false) }}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <div className={`card ${styles.root}`}>
      {/* Header */}
      <div className={`${styles.header} ${accounts.length > 0 ? styles.headerBorder : ''}`}>
        <p className={styles.headerTitle}>
          Mis Ahorros
        </p>
        <button
          onClick={() => setEditing(true)}
          className={styles.editBtn}
        >
          <Pencil size={11} />
          Editar
        </button>
      </div>

      {/* Empty state */}
      {accounts.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyMsg}>
            Sin cuentas de ahorro registradas
          </p>
          <button
            onClick={() => setEditing(true)}
            className={styles.addBtn}
          >
            Agregar cuenta
          </button>
        </div>
      )}

      {/* Total */}
      {accounts.length > 0 && (
        <div className={styles.total}>
          <p className={styles.totalLabel}>
            Total ahorrado
          </p>
          <span className={styles.totalAmount}>
            {formatCOPCompact(total)}
          </span>
        </div>
      )}

      {/* Desglose por cuenta — oculto por default */}
      {accounts.length > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className={`${styles.toggleBtn} ${expanded ? styles.toggleBtnExpanded : ''}`}
        >
          <ChevronDown size={12} className={expanded ? styles.chevronOpen : styles.chevron} />
          {expanded ? 'Ocultar desglose' : `Ver desglose (${accounts.length})`}
        </button>
      )}

      {expanded && accounts.map((account, i) => {
        const isActingOnThis = action?.accountId === account.id
        return (
          <div key={account.id}>
            <div className={`${styles.row} ${i < accounts.length - 1 && !isActingOnThis ? styles.rowBorder : ''}`}>
              <span
                className={styles.dot}
                style={{ '--clr': account.color } as React.CSSProperties}
              />
              <span className={styles.accountName}>
                {account.nombre}
              </span>
              <span className={styles.accountAmount}>
                {formatCOPCompact(account.saldo)}
              </span>
              <button
                onClick={() => isActingOnThis && action?.mode === 'deposit' ? closeAction() : openAction(account.id, 'deposit')}
                aria-label={`Aportar a ${account.nombre}`}
                aria-expanded={isActingOnThis && action?.mode === 'deposit'}
                className={`${styles.actionIconBtn} ${styles.actionIconBtnDeposit}`}
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
              {account.saldo > 0 && (
                <button
                  onClick={() => isActingOnThis && action?.mode === 'withdraw' ? closeAction() : openAction(account.id, 'withdraw')}
                  aria-label={`Retirar de ${account.nombre}`}
                  aria-expanded={isActingOnThis && action?.mode === 'withdraw'}
                  className={styles.actionIconBtn}
                >
                  <Minus size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>

            {isActingOnThis && action && (
              <div className={`${styles.withdrawForm} ${i < accounts.length - 1 ? styles.rowBorder : ''}`}>
                <p className={styles.withdrawHint}>
                  {ACTION_COPY[action.mode].hint(account.nombre)}
                </p>
                <div className={styles.withdrawInputs}>
                  <div className={styles.withdrawAmountField}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>$</span>
                    <input
                      autoFocus
                      className="input-field"
                      value={amount ? Number(amount.replace(/\D/g, '')).toLocaleString('es-CO') : ''}
                      onChange={e => setAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmAction() }}
                      placeholder="0"
                      inputMode="numeric"
                      style={{ width: 130, padding: '6px 10px', textAlign: 'right', fontSize: 'var(--text-sm)' }}
                    />
                  </div>
                </div>
                {actionErr && <p className={styles.withdrawError}>{actionErr}</p>}
                <div className={styles.withdrawActions}>
                  <button onClick={closeAction} className={styles.withdrawCancelBtn}>
                    Cancelar
                  </button>
                  <button
                    onClick={confirmAction}
                    disabled={!amount || busy}
                    className={styles.withdrawConfirmBtn}
                  >
                    {busy
                      ? <><RefreshCw size={11} className="animate-spin" /> {ACTION_COPY[action.mode].confirmingLabel}</>
                      : ACTION_COPY[action.mode].confirmLabel}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
