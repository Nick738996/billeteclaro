'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil } from 'lucide-react'
import { formatCOPCompact } from '@/lib/types'
import SavingsManager from './SavingsManager'
import type { SavingsAccount } from '@/lib/services/savingsService'
import styles from './SavingsOverview.module.css'

export default function SavingsOverview() {
  const [accounts, setAccounts] = useState<SavingsAccount[]>([])
  const [loaded,   setLoaded]   = useState(false)
  const [editing,  setEditing]  = useState(false)

  const load = useCallback(() => {
    fetch('/api/savings')
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { load() }, [load])

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

      {/* Account rows */}
      {accounts.map((account, i) => (
        <div
          key={account.id}
          className={`${styles.row} ${i < accounts.length - 1 ? styles.rowBorder : ''}`}
        >
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
        </div>
      ))}
    </div>
  )
}
