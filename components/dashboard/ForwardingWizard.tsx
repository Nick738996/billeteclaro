'use client'

import { useState, useEffect, useRef } from 'react'
import { Copy, Check, ChevronRight, ChevronDown, Mail, RefreshCw } from 'lucide-react'
import { bankSendersByBanco } from '@/lib/email/bankSenders'
import { BANCO_LABELS } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

type Step = 'confirm' | 'filter' | 'done'

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      className="flex items-center justify-between gap-2"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '10px 12px',
      }}
    >
      <code style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', wordBreak: 'break-all' }}>{value}</code>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        aria-label="Copiar"
        style={{ background: 'none', border: 'none', color: copied ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  )
}

interface Props {
  /** Texto pequeño arriba del título, ej. "Paso 2 de 3" — se omite fuera del onboarding */
  eyebrow?: string
  /** Se llama cuando el usuario confirma que ya terminó (pantalla final) */
  onDone: () => void
  doneLabel?: string
  /** Solo tiene sentido dentro del onboarding — omitir en la página del dashboard */
  onSkip?: () => void
}

export default function ForwardingWizard({ eyebrow, onDone, doneLabel = 'Continuar', onSkip }: Props) {
  const [step, setStep] = useState<Step>('confirm')
  const [email, setEmail] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [pendingConfirmUrl, setPendingConfirmUrl] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const bancos = bankSendersByBanco()

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/forwarding/status')
      const data = await res.json()
      if (!res.ok) return
      setEmail(data.email)
      setPendingConfirmUrl(data.pendingConfirmUrl ?? null)
      if (data.confirmed) {
        setConfirmed(true)
        setStep(s => (s === 'confirm' ? 'filter' : s))
      }
    } catch {
      // reintenta en el próximo poll
    }
  }

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (confirmed && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [confirmed])

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-8">
        <div>
          {eyebrow && (
            <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              {eyebrow}
            </p>
          )}
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 12 }}>
            ¡Listo!
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            De ahora en adelante, cada vez que tu banco te avise de una compra, transferencia o pago,
            ese correo llega solo a BilleteClaro y aparece en tu dashboard — sin que hagas nada más.
          </p>
        </div>
        <button
          onClick={onDone}
          data-testid={TEST_IDS.ONBOARDING_STEP2_SYNC}
          className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-95"
          style={{ background: 'var(--green)', color: '#000', padding: '14px 24px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', border: 'none', cursor: 'pointer' }}
        >
          {doneLabel}
          <ChevronRight size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        {eyebrow && (
          <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            {eyebrow}
          </p>
        )}
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 12 }}>
          Reenvía tus correos de banco
        </h1>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          BilleteClaro nunca pide acceso a tu correo. Tú decides qué reenviar — configuras un filtro
          en tu propio Gmail/Outlook y solo esos correos nos llegan.
        </p>
      </div>

      {/* Paso A — confirmar reenvío */}
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '16px 18px',
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: confirmed ? 'var(--green-soft)' : 'var(--surface)',
              border: confirmed ? 'none' : '1px solid var(--border)',
              color: confirmed ? 'var(--green)' : 'var(--text-muted)',
            }}
          >
            {confirmed ? <Check size={14} /> : <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>1</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', marginBottom: 4 }}>
              Agrega tu dirección de reenvío
            </p>
            {email ? (
              <>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                  En Gmail: Configuración → Ver toda la configuración → Reenvío y correo POP/IMAP →
                  Agregar una dirección de reenvío → pega esto → acepta el diálogo de confirmación.
                </p>
                <CopyField value={email} />
                {!confirmed && (
                  <p className="flex items-center gap-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginTop: 8 }}>
                    <RefreshCw size={12} className="animate-spin" />
                    Esperando confirmación...
                  </p>
                )}
                {!confirmed && pendingConfirmUrl && (
                  <a
                    href={pendingConfirmUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--green)', marginTop: 8, display: 'inline-block' }}
                  >
                    No se confirmó solo — confirmar manualmente
                  </a>
                )}
              </>
            ) : (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Generando tu dirección...</p>
            )}
          </div>
        </div>
      </div>

      {/* Paso B — crear el filtro */}
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '16px 18px',
          opacity: confirmed ? 1 : 0.5,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>2</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', marginBottom: 4 }}>
              Crea un filtro por cada banco
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
              Filtros y direcciones bloqueadas → Crear un nuevo filtro → pega el remitente de tu banco en &quot;De&quot; →
              Crear filtro → marca &quot;Reenviar a&quot; y elige tu dirección. Marca también{' '}
              <strong style={{ color: 'var(--text)' }}>&quot;Aplicar también a las conversaciones coincidentes&quot;</strong>{' '}
              para traer tu historial, no solo lo nuevo.
            </p>
            {confirmed && (
              <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                {bancos.map(({ banco, senders }) => (
                  <details key={banco} style={{ fontSize: 'var(--text-xs)' }}>
                    <summary
                      className="flex items-center gap-1"
                      style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 600, padding: '4px 0' }}
                    >
                      <ChevronDown size={12} />
                      {BANCO_LABELS[banco]}
                    </summary>
                    <div className="flex flex-col gap-2" style={{ paddingLeft: 16, marginTop: 4 }}>
                      {senders.map(s => <CopyField key={s} value={s} />)}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => setStep('done')}
          disabled={!confirmed}
          data-testid={TEST_IDS.ONBOARDING_STEP2_STATUS}
          className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-95"
          style={{
            background: confirmed ? 'var(--green)' : 'var(--surface)',
            color: confirmed ? '#000' : 'var(--text-muted)',
            padding: '14px 24px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)',
            border: confirmed ? 'none' : '1px solid var(--border)', cursor: confirmed ? 'pointer' : 'not-allowed',
          }}
        >
          <Mail size={18} aria-hidden="true" />
          Ya configuré mi filtro
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full text-center transition-opacity hover:opacity-70"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}
          >
            Saltar por ahora
          </button>
        )}
      </div>
    </div>
  )
}
