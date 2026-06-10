'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIA_LABELS, formatCOPCompact, isGasto, type Categoria, type Transaction } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

const ONBOARDING_CATS: Categoria[] = ['TRANSPORTE', 'SALIDAS', 'HOGAR', 'SUSCRIPCIONES']

export default function OnboardingStep3() {
  const router = useRouter()
  const [budgets, setBudgets] = useState<Record<string, string>>({
    TRANSPORTE: '', SALIDAS: '', HOGAR: '', SUSCRIPCIONES: '',
  })
  const [spending, setSpending] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const mes = format(new Date(), 'yyyy-MM')
    createClient()
      .from('transactions')
      .select('tipo, categoria, monto')
      .eq('mes_contable', mes)
      .then(({ data }) => {
        const s: Record<string, number> = {}
        for (const t of (data ?? []) as Pick<Transaction, 'tipo' | 'categoria' | 'monto'>[]) {
          if (isGasto(t.tipo)) s[t.categoria] = (s[t.categoria] ?? 0) + t.monto
        }
        setSpending(s)
      })
  }, [])

  const handleComplete = async (skipBudgets = false) => {
    setSaving(true)
    try {
      if (!skipBudgets) {
        const mes = format(new Date(), 'yyyy-MM')
        const items = ONBOARDING_CATS
          .filter(cat => Number(budgets[cat]) > 0)
          .map(cat => ({ categoria: cat, monto: Number(budgets[cat]) }))
        if (items.length > 0) {
          await fetch('/api/budgets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mes, items }),
          })
        }
      }
      await fetch('/api/onboarding/complete', { method: 'POST' })
      router.push('/dashboard')
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Paso 3 de 3
        </p>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 12 }}>
          ¿Cuánto quieres gastar?
        </h1>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Ponle límite a lo que más te importa. Puedes cambiarlo cuando quieras desde el dashboard.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {ONBOARDING_CATS.map(cat => (
          <div
            key={cat}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <p className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                {CATEGORIA_LABELS[cat]}
              </p>
              {spending[cat] ? (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Gastaste {formatCOPCompact(spending[cat])} este mes
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flexShrink: 0 }}>$</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={budgets[cat]}
                onChange={e => setBudgets(prev => ({ ...prev, [cat]: e.target.value.replace(/\D/g, '') }))}
                aria-label={`Presupuesto para ${CATEGORIA_LABELS[cat]}`}
                data-testid={`${TEST_IDS.BUDGET_CATEGORY_INPUT}-${cat.toLowerCase()}`}
                className="input-field"
                style={{ flex: 1, padding: '6px 10px', fontSize: 'var(--text-sm)' }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => handleComplete(false)}
          disabled={saving}
          data-testid={TEST_IDS.ONBOARDING_STEP3_CONTINUE}
          className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-60"
          style={{ background: 'var(--green)', color: '#000', padding: '14px 24px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Guardando...' : 'Ir al dashboard'}
          {!saving && <ChevronRight size={18} />}
        </button>
        <button
          onClick={() => handleComplete(true)}
          disabled={saving}
          className="w-full text-center transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', padding: '8px 0' }}
        >
          Saltar y configurar después
        </button>
      </div>
    </div>
  )
}
