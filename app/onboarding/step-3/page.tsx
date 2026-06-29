'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { formatCOPCompact, isGasto, type Categoria, type Transaction } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

const CATS: {
  key: Categoria
  label: string
  emoji: string
  presets: number[]
}[] = [
  { key: 'TRANSPORTE',    label: 'Transporte',    emoji: '🚌', presets: [100_000, 200_000, 350_000, 500_000] },
  { key: 'SALIDAS',       label: 'Salidas',        emoji: '🍽️', presets: [200_000, 400_000, 600_000, 1_000_000] },
  { key: 'HOGAR',         label: 'Hogar',          emoji: '🏠', presets: [500_000, 800_000, 1_200_000, 2_000_000] },
  { key: 'SUSCRIPCIONES', label: 'Suscripciones',  emoji: '📱', presets: [50_000, 100_000, 150_000, 200_000] },
]

function formatInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('es-CO')
}

function parseInput(formatted: string): number {
  return Number(formatted.replace(/\./g, '').replace(/,/g, ''))
}

export default function OnboardingStep3() {
  const router = useRouter()
  const [values, setValues]   = useState<Record<string, string>>({})
  const [spending, setSpending] = useState<Record<string, number>>({})
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    const mes = format(new Date(), 'yyyy-MM')
    createClient()
      .from('transactions')
      .select('tipo, categoria, monto')
      .eq('mes_contable', mes)
      .then(({ data }) => {
        const s: Record<string, number> = {}
        for (const t of (data ?? []) as Pick<Transaction, 'tipo' | 'categoria' | 'monto'>[]) {
          if (isGasto(t.tipo, t.categoria)) s[t.categoria] = (s[t.categoria] ?? 0) + t.monto
        }
        setSpending(s)
      })
  }, [])

  const setPreset = (key: string, amount: number) => {
    setValues(prev => ({ ...prev, [key]: amount.toLocaleString('es-CO') }))
  }

  const handleInput = (key: string, raw: string) => {
    setValues(prev => ({ ...prev, [key]: formatInput(raw) }))
  }

  const handleComplete = async (skipBudgets = false) => {
    setSaving(true)
    try {
      if (!skipBudgets) {
        const mes = format(new Date(), 'yyyy-MM')
        const items = CATS
          .map(c => ({ categoria: c.key, monto: parseInput(values[c.key] ?? '') }))
          .filter(i => i.monto > 0)
        if (items.length > 0) {
          await fetch('/api/budgets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mes, items }),
          })
        }
      }
      const res = await fetch('/api/onboarding/complete', { method: 'POST' })
      if (!res.ok) throw new Error()
      router.push('/dashboard')
    } catch {
      setSaving(false)
    }
  }

  const anySet = CATS.some(c => parseInput(values[c.key] ?? '') > 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Paso 3 de 3
        </p>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 10 }}>
          Ponle límite a tus gastos
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Elige cuánto quieres gastar en cada categoría. Puedes cambiarlo en cualquier momento.
        </p>
      </div>

      {/* Category cards */}
      <div className="flex flex-col gap-3">
        {CATS.map(({ key, label, emoji, presets }) => {
          const selected = parseInput(values[key] ?? '')
          const spent    = spending[key]

          return (
            <div
              key={key}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${selected > 0 ? 'var(--green)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '14px 16px',
                transition: 'border-color 0.2s',
              }}
            >
              {/* Row 1: emoji + label + amount input */}
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</span>
                <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', flex: 1 }}>
                  {label}
                </span>
                <div className="flex items-center gap-1">
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={values[key] ?? ''}
                    onChange={e => handleInput(key, e.target.value)}
                    aria-label={`Presupuesto para ${label}`}
                    data-testid={`${TEST_IDS.BUDGET_CATEGORY_INPUT}-${key.toLowerCase()}`}
                    style={{
                      width: 90,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      textAlign: 'right',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: selected > 0 ? 'var(--green)' : 'var(--text)',
                      padding: 0,
                    }}
                  />
                </div>
              </div>

              {/* Row 2: preset chips */}
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
                {presets.map(p => (
                  <button
                    key={p}
                    onClick={() => setPreset(key, p)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selected === p ? 'var(--green)' : 'var(--bg)',
                      color: selected === p ? '#000' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {formatCOPCompact(p)}
                  </button>
                ))}
                {selected > 0 && !presets.includes(selected) && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                    personalizado
                  </span>
                )}
              </div>

              {/* Row 3: gasto real si existe */}
              {spent ? (
                <p style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                  Gastaste {formatCOPCompact(spent)} este mes
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => handleComplete(false)}
          disabled={saving}
          data-testid={TEST_IDS.ONBOARDING_STEP3_CONTINUE}
          className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-60"
          style={{
            background: anySet ? 'var(--green)' : 'var(--text)',
            color: anySet ? '#000' : 'var(--bg)',
            padding: '14px 24px',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-base)',
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Guardando...' : anySet ? 'Guardar y ver mi dashboard' : 'Ir al dashboard'}
          {!saving && <ChevronRight size={18} />}
        </button>
        <button
          onClick={() => handleComplete(true)}
          disabled={saving}
          className="w-full text-center transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', padding: '8px 0' }}
        >
          Configurar después
        </button>
      </div>
    </div>
  )
}
