'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, CheckCircle2, ChevronRight, Mail } from 'lucide-react'
import SyncErrorCard, { type SyncErrorType } from '@/components/ui/SyncErrorCard'
import { TEST_IDS } from '@/lib/testIds'

const LOADING_MESSAGES = [
  'Conectando con Gmail...',
  'Leyendo correos de banco...',
  'Extrayendo transacciones...',
  'Organizando tu historial...',
  'Casi listo...',
]

function classifyError(status: number, message: string): SyncErrorType {
  const msg = message.toLowerCase()
  if (status === 400 && msg.includes('token')) return 'gmail_auth_expired'
  if (msg.includes('permission') || msg.includes('permiso')) return 'gmail_permission_denied'
  if (msg.includes('timeout') || msg.includes('tarde')) return 'sync_timeout'
  return 'unknown'
}

type SyncState = 'idle' | 'syncing' | 'success' | 'no_emails' | 'error'

export default function OnboardingStep2() {
  const router = useRouter()
  const [state, setState] = useState<SyncState>('idle')
  const [msgIdx, setMsgIdx] = useState(0)
  const [txCount, setTxCount] = useState(0)
  const [errorType, setErrorType] = useState<SyncErrorType>('unknown')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (state === 'syncing') {
      intervalRef.current = setInterval(() => {
        setMsgIdx(i => (i + 1) % LOADING_MESSAGES.length)
      }, 1800)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [state])

  const handleSync = async () => {
    setState('syncing')
    setMsgIdx(0)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setErrorType(classifyError(res.status, body?.error ?? ''))
        setState('error')
        return
      }
      const count: number = body?.data?.transacciones_nuevas ?? 0
      setTxCount(count)
      setState(count === 0 ? 'no_emails' : 'success')
    } catch {
      setErrorType('sync_timeout')
      setState('error')
    }
  }

  if (state === 'syncing') {
    return (
      <div className="flex flex-col items-center justify-center gap-8 py-12">
        <div
          className="flex items-center justify-center"
          style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-soft)', color: 'var(--green)' }}
        >
          <RefreshCw size={28} className="animate-spin" aria-hidden="true" />
        </div>
        <div className="text-center" data-testid={TEST_IDS.ONBOARDING_STEP2_STATUS} aria-live="polite" aria-label="Estado de sincronización">
          <p className="font-semibold" style={{ fontSize: 'var(--text-lg)', color: 'var(--text)', marginBottom: 8 }}>
            Sincronizando...
          </p>
          <p key={msgIdx} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {LOADING_MESSAGES[msgIdx]}
          </p>
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
          Esto puede tardar hasta 30 segundos
        </p>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Paso 2 de 3
          </p>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 12 }}>
            ¡Listo!
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Encontramos{' '}
            <strong style={{ color: 'var(--text)' }}>
              {txCount} transacción{txCount !== 1 ? 'es' : ''}
            </strong>{' '}
            en tus correos de banco.
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center"
          style={{ background: 'var(--green-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px 20px' }}
        >
          <CheckCircle2 size={48} style={{ color: 'var(--green)', marginBottom: 12 }} />
          <p className="font-semibold" style={{ fontSize: 'var(--text-base)', color: 'var(--text)' }}>
            Sincronización exitosa
          </p>
        </div>
        <button
          onClick={() => router.push('/onboarding/step-3')}
          className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-95"
          style={{ background: 'var(--green)', color: '#000', padding: '14px 24px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', border: 'none', cursor: 'pointer' }}
        >
          Continuar
          <ChevronRight size={18} />
        </button>
      </div>
    )
  }

  if (state === 'no_emails') {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Paso 2 de 3
          </p>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 12 }}>
            Sin correos por ahora
          </h1>
        </div>
        <SyncErrorCard type="no_emails_found" onRetry={() => setState('idle')} />
        <button
          onClick={() => router.push('/onboarding/step-3')}
          className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-95"
          style={{ background: 'var(--surface)', color: 'var(--text)', padding: '14px 24px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          Continuar de todas formas
          <ChevronRight size={18} />
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Paso 2 de 3
          </p>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 12 }}>
            Algo salió mal
          </h1>
        </div>
        <SyncErrorCard type={errorType} onRetry={() => setState('idle')} />
        <button
          onClick={() => router.push('/onboarding/step-3')}
          className="w-full text-center transition-opacity hover:opacity-70"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
        >
          Saltar por ahora
        </button>
      </div>
    )
  }

  // idle
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Paso 2 de 3
        </p>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 12 }}>
          Sincroniza tus correos
        </h1>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Vamos a leer tus notificaciones de RappiCard y RappiPay. Solo lectura — nunca escribimos nada en tu nombre.
        </p>
      </div>

      <div
        className="flex items-center justify-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px 20px' }}
      >
        <div className="text-center">
          <div
            className="flex items-center justify-center mx-auto mb-4"
            style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', background: 'var(--green-soft)', color: 'var(--green)' }}
          >
            <Mail size={24} />
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Correos de banco listos para sincronizar
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={handleSync}
          data-testid={TEST_IDS.ONBOARDING_STEP2_SYNC}
          className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-95"
          style={{ background: 'var(--green)', color: '#000', padding: '14px 24px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', border: 'none', cursor: 'pointer' }}
        >
          <RefreshCw size={18} aria-hidden="true" />
          Sincronizar mis correos
        </button>
        <button
          onClick={() => router.push('/onboarding/step-3')}
          className="w-full text-center transition-opacity hover:opacity-70"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}
        >
          Saltar por ahora
        </button>
      </div>
    </div>
  )
}
