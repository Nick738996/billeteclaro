'use client'

import { useState } from 'react'
import { Sparkles, AlertTriangle, Lightbulb, CheckCircle, RefreshCw } from 'lucide-react'
import type { AdvisorInsight } from '@/app/api/ai-advisor/route'

interface Props {
  mes: string
  gastosPorCategoria: Record<string, number>
  budgets: Record<string, number>
}

const ICON: Record<AdvisorInsight['tipo'], React.ReactNode> = {
  alerta:   <AlertTriangle size={14} />,
  consejo:  <Lightbulb size={14} />,
  positivo: <CheckCircle size={14} />,
}

const COLORS: Record<AdvisorInsight['tipo'], { color: string; bg: string }> = {
  alerta:   { color: 'var(--red)',    bg: 'var(--red-soft)' },
  consejo:  { color: 'var(--blue)',   bg: 'var(--blue-soft)' },
  positivo: { color: 'var(--green)',  bg: 'var(--green-soft)' },
}

export default function AIAdvisor({ mes, gastosPorCategoria, budgets }: Props) {
  const [insights, setInsights]   = useState<AdvisorInsight[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [analyzed, setAnalyzed]   = useState(false)

  const budgetCount = Object.keys(budgets).filter(k => budgets[k] > 0).length

  const analyze = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes, gastos: gastosPorCategoria, budgets }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setInsights(data.insights ?? [])
      setAnalyzed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 16px 14px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: 'var(--purple)' }} />
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
              Asesor IA
            </p>
          </div>

          {(budgetCount >= 1 || analyzed) && (
            <button
              onClick={analyze}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                background: 'var(--purple-soft)',
                border: '1px solid var(--purple)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--purple)',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading
                ? <><RefreshCw size={11} className="animate-spin" /> Analizando…</>
                : analyzed
                  ? <><RefreshCw size={11} /> Actualizar</>
                  : <><Sparkles size={11} /> Analizar</>
              }
            </button>
          )}
        </div>

        {budgetCount === 0 && !analyzed && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 8 }}>
            Configura al menos un presupuesto para activar el análisis.
          </p>
        )}
      </div>

      {error && (
        <div style={{ padding: '0 16px 14px' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--red)' }}>{error}</p>
        </div>
      )}

      {loading && !analyzed && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[80, 100, 64, 90].map((w, i) => (
            <div key={i} style={{ height: 12, width: `${w}%`, background: 'var(--surface-2)', borderRadius: 6 }} />
          ))}
        </div>
      )}

      {insights.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-soft)', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insights.map((ins, i) => {
            const { color, bg } = COLORS[ins.tipo]
            return (
              <div
                key={i}
                className="flex items-start gap-2"
                style={{
                  background: bg,
                  border: `1px solid ${color}44`,
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                }}
              >
                <span style={{ color, flexShrink: 0, marginTop: 1 }}>
                  {ICON[ins.tipo]}
                </span>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', lineHeight: 1.45 }}>
                  {ins.texto}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
