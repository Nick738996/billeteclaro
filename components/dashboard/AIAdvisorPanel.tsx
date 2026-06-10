'use client'

import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Lightbulb, CircleCheck, TrendingUp, Eye, Send, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'
import type { Insight, InsightTipo } from '@/lib/types'
import { formatCOP, CATEGORIA_LABELS } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

interface Props {
  mes: string
  budgetCount: number
  txCount: number
  contextVersion?: number
  onOpenBudgets?: () => void
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

type ColorConfig = {
  accent: string
  badgeBg: string
  badgeText: string
  Icon: LucideIcon
  label: string
}

const COLOR_MAP: Record<InsightTipo, ColorConfig> = {
  alerta:      { accent: 'var(--red)',    badgeBg: 'var(--red-soft)',    badgeText: 'var(--red)',    Icon: AlertTriangle, label: 'Alerta'     },
  consejo:     { accent: 'var(--blue)',   badgeBg: 'var(--blue-soft)',   badgeText: 'var(--blue)',   Icon: Lightbulb,     label: 'Consejo'    },
  positivo:    { accent: 'var(--green)',  badgeBg: 'var(--green-soft)',  badgeText: 'var(--green)',  Icon: CircleCheck,   label: 'Positivo'   },
  proyeccion:  { accent: 'var(--yellow)', badgeBg: 'var(--yellow-soft)', badgeText: 'var(--yellow)', Icon: TrendingUp,    label: 'Proyección' },
  observacion: { accent: 'var(--purple)', badgeBg: 'var(--purple-soft)', badgeText: 'var(--purple)', Icon: Eye,           label: 'Dato'       },
}

function InsightCard({ insight }: { insight: Insight }) {
  const c = COLOR_MAP[insight.tipo]
  const categoriaLabel = insight.categoria ? (CATEGORIA_LABELS[insight.categoria as keyof typeof CATEGORIA_LABELS] ?? insight.categoria) : null

  // Only show limite_sugerido badge when the number isn't already visible in the text
  const limiteStr = insight.limite_sugerido != null ? formatCOP(insight.limite_sugerido) : null
  const limiteAlreadyInText = limiteStr != null && insight.texto.includes(limiteStr)
  const showLimiteBadge = limiteStr != null && !limiteAlreadyInText

  return (
    <div
      data-testid={TEST_IDS.ADVISOR_INSIGHT_CARD}
      role="article"
      aria-label={`${c.label}${insight.categoria ? ` — ${CATEGORIA_LABELS[insight.categoria as keyof typeof CATEGORIA_LABELS] ?? insight.categoria}` : ''}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${c.accent}`,
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Header row: icon + label badge + optional categoria badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: c.accent, flexShrink: 0, display: 'flex' }}><c.Icon size={13} /></span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: c.badgeText,
            background: c.badgeBg,
            borderRadius: 'var(--radius-badge)',
            padding: '1px 7px',
          }}
        >
          {c.label}
        </span>
        {categoriaLabel && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-badge)',
              padding: '1px 7px',
            }}
          >
            {categoriaLabel}
          </span>
        )}
      </div>

      {/* Text */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', lineHeight: 1.45, margin: 0 }}>
        {insight.texto}
      </p>

      {/* Límite sugerido badge — only when not already mentioned */}
      {showLimiteBadge && (
        <span
          style={{
            alignSelf: 'flex-start',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: c.accent,
            background: c.badgeBg,
            borderRadius: 'var(--radius-badge)',
            padding: '2px 8px',
          }}
        >
          Límite: {limiteStr}
        </span>
      )}
    </div>
  )
}

function SkeletonInsights() {
  const lines = ['75%', '60%', '82%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 14 }}>
      {lines.map((w, i) => (
        <div
          key={i}
          style={{
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)',
            borderLeft: '3px solid var(--border)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            animation: `pulse 1.6s ease-in-out ${i * 0.18}s infinite`,
          }}
        >
          {/* badge placeholder */}
          <div style={{ height: 13, width: '28%', borderRadius: 'var(--radius-badge)', background: 'var(--surface)' }} />
          {/* text placeholder */}
          <div style={{ height: 11, width: w, borderRadius: 'var(--radius-xs)', background: 'var(--surface)' }} />
        </div>
      ))}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '6px 4px' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: 'var(--text-muted)',
            display: 'inline-block',
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export default function AIAdvisorPanel({ mes, budgetCount, txCount, contextVersion = 0, onOpenBudgets }: Props) {
  const [insights, setInsights]       = useState<Insight[]>([])
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsError, setInsightsError]     = useState<string | null>(null)

  const [chatOpen, setChatOpen] = useState(false)
  const [history, setHistory]   = useState<ChatMsg[]>([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  // Reset chat cuando cambia el mes
  useEffect(() => {
    setHistory([])
    setInsights([])
    setInsightsError(null)
    setChatOpen(false)
  }, [mes])

  // Cargar insights al montar y cuando cambie el contexto (datos o presupuestos)
  useEffect(() => {
    if (budgetCount < 1 || txCount < 5) return
    fetchInsights()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, budgetCount, txCount, contextVersion])

  // Scroll al fondo del chat cuando hay mensajes nuevos
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [history, chatOpen, sending])

  async function fetchInsights() {
    setLoadingInsights(true)
    setInsightsError(null)
    try {
      const res = await fetch(`/api/ai/insights?mes=${mes}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(res.status === 429
          ? (data?.error ?? 'Límite diario de IA alcanzado — vuelve en unos minutos')
          : 'No se pudieron cargar los insights. Intenta de nuevo.')
      }
      setInsights(data.insights ?? [])
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : 'Error desconocido.')
    } finally {
      setLoadingInsights(false)
    }
  }

  async function sendMessage() {
    const msg = input.trim()
    if (!msg || sending) return

    setInput('')
    setHistory(h => [...h, { role: 'user', content: msg }])
    setSending(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, mes }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setHistory(h => [...h, { role: 'assistant', content: data.response }])
    } catch {
      setHistory(h => [...h, { role: 'assistant', content: 'Hubo un error. Intenta de nuevo.' }])
    } finally {
      setSending(false)
    }
  }

  // --- Estado vacío: sin presupuestos ---
  if (budgetCount < 1) {
    return (
      <div className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
          Configura tu presupuesto mensual para activar el asesor
        </p>
        {onOpenBudgets && (
          <button
            onClick={onOpenBudgets}
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--green)',
              background: 'var(--green-soft)',
              border: '1px solid var(--green)',
              borderRadius: 'var(--radius-badge)',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Configurar presupuesto
          </button>
        )}
      </div>
    )
  }

  // --- Estado vacío: sin transacciones ---
  if (txCount < 5) {
    return (
      <div className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Sincroniza tus gastos primero para que pueda analizarlos
        </p>
      </div>
    )
  }

  return (
    <>
      {/* keyframes inyectados inline una vez */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      `}</style>

      <div className="card" data-testid={TEST_IDS.ADVISOR_PANEL} aria-label="Asesor financiero">
        {/* Header */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
              Asesor financiero
            </span>
            {!loadingInsights && insights.length === 0 && !insightsError && (
              <button
                onClick={fetchInsights}
                data-testid={TEST_IDS.ADVISOR_REFRESH_BUTTON}
                aria-label="Analizar mis finanzas"
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--green)',
                  background: 'var(--green-soft)',
                  border: '1px solid var(--green)',
                  borderRadius: 'var(--radius-badge)',
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                Analizar
              </button>
            )}
            {!loadingInsights && insights.length > 0 && (
              <button
                onClick={fetchInsights}
                data-testid={TEST_IDS.ADVISOR_REFRESH_BUTTON}
                aria-label="Actualizar análisis"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Actualizar
              </button>
            )}
          </div>

          {/* Insights */}
          {loadingInsights && <SkeletonInsights />}

          {insightsError && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', marginBottom: 12 }}>
              {insightsError}
            </p>
          )}

          {!loadingInsights && insights.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {insights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </div>
          )}
        </div>

        {/* Botón expandir chat */}
        {insights.length > 0 && (
          <button
            onClick={() => {
              setChatOpen(o => !o)
              if (!chatOpen) setTimeout(() => inputRef.current?.focus(), 100)
            }}
            data-testid={TEST_IDS.ADVISOR_CHAT_TOGGLE}
            aria-expanded={chatOpen}
            aria-controls="advisor-chat-section"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderTop: '1px solid var(--border-soft)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
            }}
          >
            {chatOpen ? (
              <><ChevronUp size={13} /> Cerrar asesor</>
            ) : (
              <><ChevronDown size={13} /> Hablar con mi asesor</>
            )}
          </button>
        )}

        {/* Chat */}
        {chatOpen && (
          <div id="advisor-chat-section" role="region" aria-label="Chat con el asesor" style={{ borderTop: '1px solid var(--border-soft)' }}>
            {/* Historial */}
            <div
              style={{
                maxHeight: 280,
                overflowY: 'auto',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {history.length === 0 && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Pregúntame lo que quieras sobre tus finanzas de este mes
                </p>
              )}
              {history.map((msg, i) => (
                <div
                  key={i}
                  data-testid={TEST_IDS.ADVISOR_CHAT_MESSAGE}
                  role={msg.role === 'assistant' ? 'status' : undefined}
                  aria-label={msg.role === 'user' ? 'Tú' : 'Asesor'}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.role === 'user' ? 'var(--green-soft)' : 'var(--surface-2)',
                      border: `1px solid ${msg.role === 'user' ? 'var(--green)' : 'var(--border)'}`,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text)',
                      lineHeight: 1.4,
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div
                    style={{
                      padding: '6px 12px',
                      borderRadius: '14px 14px 14px 4px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <ThinkingDots />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                padding: '10px 16px 14px',
                borderTop: '1px solid var(--border-soft)',
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Pregúntame algo… (Enter para enviar)"
                disabled={sending}
                aria-label="Mensaje para el asesor"
                data-testid={TEST_IDS.ADVISOR_CHAT_INPUT}
                style={{
                  flex: 1,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '8px 12px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                aria-label="Enviar mensaje"
                data-testid={TEST_IDS.ADVISOR_CHAT_SEND}
                style={{
                  width: 36, height: 36,
                  borderRadius: 'var(--radius-pill)',
                  background: input.trim() && !sending ? 'var(--green-soft)' : 'var(--surface-2)',
                  border: `1px solid ${input.trim() && !sending ? 'var(--green)' : 'var(--border)'}`,
                  color: input.trim() && !sending ? 'var(--green)' : 'var(--text-subtle)',
                  cursor: input.trim() && !sending ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
