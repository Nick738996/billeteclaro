'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil } from 'lucide-react'
import { formatCOPCompact } from '@/lib/types'
import SavingsManager from './SavingsManager'
import type { SavingsAccount } from '@/lib/services/savingsService'

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
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="skeleton" style={{ height: 11, width: 100, marginBottom: 16, borderRadius: 4 }} />
      {[75, 55].map((w, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div className="skeleton" style={{ height: 10, width: `${w}%`, borderRadius: 4 }} />
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
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: '14px 16px 10px', borderBottom: (accounts.length > 0) ? '1px solid var(--border-soft)' : 'none' }}
      >
        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Mis Ahorros
        </p>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500, padding: '2px 0' }}
        >
          <Pencil size={11} />
          Editar
        </button>
      </div>

      {/* Empty state */}
      {accounts.length === 0 && (
        <div style={{ padding: '28px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
            Sin cuentas de ahorro registradas
          </p>
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--green)', background: 'var(--green-soft)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '6px 14px', cursor: 'pointer' }}
          >
            Agregar cuenta
          </button>
        </div>
      )}

      {/* Total */}
      {accounts.length > 0 && (
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-soft)' }}>
          <p style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
            Total ahorrado
          </p>
          <span
            className="tabular-nums"
            style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--green)', letterSpacing: '-0.03em', lineHeight: 1 }}
          >
            {formatCOPCompact(total)}
          </span>
        </div>
      )}

      {/* Account rows */}
      {accounts.map((account, i) => (
        <div
          key={account.id}
          className="flex items-center gap-3"
          style={{ padding: '11px 16px', borderBottom: i < accounts.length - 1 ? '1px solid var(--border-soft)' : 'none' }}
        >
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: account.color, flexShrink: 0 }} />
          <span className="flex-1 truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
            {account.nombre}
          </span>
          <span className="tabular-nums flex-shrink-0" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
            {formatCOPCompact(account.saldo)}
          </span>
        </div>
      ))}
    </div>
  )
}
