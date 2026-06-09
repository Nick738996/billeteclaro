'use client'

import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'
import ThemeToggle from '@/components/ui/ThemeToggle'

export default function LandingPage() {
  const supabase = createClient()

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        scopes: [
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.readonly',
        ].join(' '),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 relative"
      style={{ background: 'var(--bg)' }}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm flex flex-col items-center gap-10">

        {/* Logo — ícono + wordmark con contraste de pesos */}
        <div className="flex flex-col items-center gap-4">
          {/* App icon mark — currentColor adapta a dark/light */}
          <svg viewBox="0 0 100 100" width="64" height="64" aria-hidden="true"
            style={{ color: 'var(--text)' }}>
            <rect width="100" height="100" rx="17" style={{ fill: 'var(--surface)' }}/>
            <line x1="30" y1="18" x2="30" y2="82"
              stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
            <path d="M30,18 Q70,18 70,34 Q70,50 30,50"
              stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
            <path d="M30,50 Q78,50 78,66 Q78,82 30,82"
              stroke="#4ADE80" strokeWidth="6" fill="none" strokeLinecap="round"/>
          </svg>

          <div className="text-center">
            {/* Wordmark: Billete (thin) + Claro (bold, green) */}
            <h1
              className="tracking-tight"
              style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.1 }}
            >
              <span style={{ fontWeight: 300, color: 'var(--text)' }}>Billete</span>
              <span style={{ fontWeight: 700, color: 'var(--green)' }}>Claro</span>
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 5 }}>
              Tu radar financiero personal
            </p>
          </div>
        </div>

        {/* Value props */}
        <div className="w-full space-y-3">
          {[
            'Lee automáticamente tus correos de banco',
            'Extrae cada transacción sin que hagas nada',
            'Categoriza con IA y muestra tu resumen',
          ].map((text) => (
            <div key={text} className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--green-soft)', color: 'var(--green)' }}
              >
                <Check size={11} strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {text}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 font-medium transition-opacity hover:opacity-90 active:scale-95"
            style={{
              background: 'var(--text)',
              color: 'var(--bg)',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" opacity=".85"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".75"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity=".65"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity=".55"/>
            </svg>
            Conectar con Google
          </button>
          <p
            className="text-center"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
          >
            Solo lectura de correos. Nunca enviamos mensajes en tu nombre.
          </p>
        </div>

      </div>
    </main>
  )
}
