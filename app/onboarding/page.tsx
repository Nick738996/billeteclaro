'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingStep1() {
  const router = useRouter()
  const [name, setName] = useState('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const full = data.user?.user_metadata?.full_name ?? data.user?.email ?? ''
      setName(full.split(' ')[0])
    })
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Paso 1 de 3
        </p>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 12 }}>
          {name ? `¡Hola, ${name}!` : '¡Hola!'}
        </h1>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Vamos a configurar BilleteClaro en 2 minutos. Sin llenar formularios, sin datos manuales.
        </p>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {[
          'Sincronizamos tus correos de banco',
          'Tú decides cuánto quieres gastar',
          'Ya tienes tu dashboard listo',
        ].map((text, i) => (
          <div key={text} className="flex items-center gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 28, height: 28,
                borderRadius: '50%',
                background: 'var(--green-soft)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                color: 'var(--green)',
              }}
            >
              {i + 1}
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{text}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push('/onboarding/step-2')}
        className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-95"
        style={{
          background: 'var(--green)',
          color: '#000',
          padding: '14px 24px',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-base)',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Empecemos
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
