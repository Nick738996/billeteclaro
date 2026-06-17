'use client'

import { useState } from 'react'
import { ArrowLeft, Plus, Trash2, Check, RefreshCw } from 'lucide-react'
import { formatCOPCompact } from '@/lib/types'
import type { SavingsAccount } from '@/lib/services/savingsService'

const COLORS = ['#4ADE80', '#60A5FA', '#A78BFA', '#FCD34D', '#FB923C', '#FF6B6B']

interface Draft {
  tempId: string
  nombre: string
  saldo: number
  color: string
}

interface Props {
  initialAccounts: SavingsAccount[]
  onSaved: (accounts: SavingsAccount[]) => void
  onClose: () => void
}

export default function SavingsManager({ initialAccounts, onSaved, onClose }: Props) {
  const [draft, setDraft] = useState<Draft[]>(
    initialAccounts.map(a => ({ tempId: a.id, nombre: a.nombre, saldo: a.saldo, color: a.color }))
  )
  const [saving,  setSaving]  = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const add = () =>
    setDraft(prev => [...prev, {
      tempId: `new-${Date.now()}`,
      nombre: '',
      saldo:  0,
      color:  COLORS[prev.length % COLORS.length],
    }])

  const remove = (tempId: string) => setDraft(prev => prev.filter(a => a.tempId !== tempId))

  const update = (tempId: string, field: 'nombre' | 'saldo' | 'color', value: string | number) =>
    setDraft(prev => prev.map(a => a.tempId === tempId ? { ...a, [field]: value } : a))

  const handleSave = async () => {
    setSaving(true)
    setSaveErr(null)
    try {
      const valid = draft.filter(a => a.nombre.trim().length > 0)
      const res = await fetch('/api/savings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: valid.map(a => ({ nombre: a.nombre.trim(), saldo: a.saldo, color: a.color })) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      setSavedOk(true)
      const fresh = await fetch('/api/savings').then(r => r.json()) as { accounts?: SavingsAccount[] }
      setTimeout(() => onSaved(fresh.accounts ?? []), 700)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  const total = draft.reduce((s, a) => s + a.saldo, 0)

  return (
    <div className="card">
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-soft)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              aria-label="Volver"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px 4px 2px 0' }}
            >
              <ArrowLeft size={15} />
            </button>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>Mis Ahorros</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || savedOk}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px',
              background: savedOk ? 'var(--green-soft)' : 'var(--surface-2)',
              border: `1px solid ${savedOk ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              color: savedOk ? 'var(--green)' : 'var(--text)',
              fontSize: 'var(--text-xs)', fontWeight: 500,
              cursor: saving || savedOk ? 'default' : 'pointer',
            }}
          >
            {saving  ? <><RefreshCw size={11} className="animate-spin" /> Guardando…</> :
             savedOk ? <><Check size={11} /> Guardado</> : 'Guardar'}
          </button>
        </div>
        {total > 0 && (
          <p className="tabular-nums" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4, paddingLeft: 23 }}>
            Total: {formatCOPCompact(total)}
          </p>
        )}
      </div>

      {/* Account rows */}
      {draft.map(account => (
        <div key={account.tempId} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          {/* Color picker + delete */}
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => update(account.tempId, 'color', c)}
                aria-label={`Color ${c}`}
                style={{
                  width: account.color === c ? 16 : 11,
                  height: account.color === c ? 16 : 11,
                  borderRadius: '50%',
                  background: c,
                  border: account.color === c ? '2px solid var(--text)' : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 0.12s',
                  flexShrink: 0,
                }}
              />
            ))}
            <button
              onClick={() => remove(account.tempId)}
              aria-label="Eliminar cuenta"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex', marginLeft: 'auto', padding: 0 }}
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Nombre + saldo */}
          <div className="flex items-center gap-2">
            <input
              className="input-field"
              value={account.nombre}
              onChange={e => update(account.tempId, 'nombre', e.target.value)}
              placeholder="Nombre (ej. Bancolombia Ahorros)"
              style={{ flex: 1, padding: '6px 10px', fontSize: 'var(--text-sm)' }}
            />
            <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>$</span>
              <input
                className="input-field"
                value={account.saldo > 0 ? account.saldo.toLocaleString('es-CO') : ''}
                onChange={e => update(account.tempId, 'saldo', parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)}
                placeholder="0"
                inputMode="numeric"
                style={{ width: 110, padding: '6px 8px', textAlign: 'right', fontSize: 'var(--text-sm)' }}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Error */}
      {saveErr && (
        <div style={{ padding: '10px 16px', background: 'var(--red-soft)', borderTop: '1px solid var(--border-soft)' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--red)' }}>{saveErr}</p>
        </div>
      )}

      {/* Add account */}
      <button
        onClick={add}
        className="flex items-center gap-2 w-full transition-opacity hover:opacity-70"
        style={{ padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}
      >
        <Plus size={13} />
        Agregar cuenta
      </button>
    </div>
  )
}
