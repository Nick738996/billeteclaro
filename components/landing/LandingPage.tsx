'use client'

import { createClient } from '@/lib/supabase/client'
import { Lock, Mail, BarChart2 } from 'lucide-react'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { TEST_IDS } from '@/lib/testIds'

const GoogleIcon = () => (
  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" opacity=".85"/>
    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".75"/>
    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity=".65"/>
    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity=".55"/>
  </svg>
)

const OutlookIcon = () => (
  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="9.5" height="9.5" rx="1" fill="currentColor" opacity=".9"/>
    <rect x="12.5" y="2" width="9.5" height="9.5" rx="1" fill="currentColor" opacity=".7"/>
    <rect x="2" y="12.5" width="9.5" height="9.5" rx="1" fill="currentColor" opacity=".7"/>
    <rect x="12.5" y="12.5" width="9.5" height="9.5" rx="1" fill="currentColor" opacity=".5"/>
  </svg>
)

const Logo = () => (
  <div className="flex items-center gap-2">
    <svg viewBox="0 0 100 100" width="40" height="40" aria-hidden="true" style={{ color: 'var(--text)' }}>
      <rect width="100" height="100" rx="17" style={{ fill: 'var(--surface)' }}/>
      <line x1="30" y1="18" x2="30" y2="82" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
      <path d="M30,18 Q70,18 70,34 Q70,50 30,50" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <path d="M30,50 Q78,50 78,66 Q78,82 30,82" stroke="var(--green)" strokeWidth="6" fill="none" strokeLinecap="round"/>
    </svg>
    <span style={{ fontSize: 'var(--text-lg)', letterSpacing: '-0.02em' }}>
      <span style={{ fontWeight: 400, color: 'var(--text)' }}>Billete</span>
      <span style={{ fontWeight: 700, color: 'var(--green)' }}>Claro</span>
    </span>
  </div>
)

const STEPS = [
  {
    Icon: Lock,
    titulo: 'Conectas tu cuenta de correo',
    descripcion: 'Gmail u Outlook. Solo leemos correos de banco, nada más.',
  },
  {
    Icon: Mail,
    titulo: 'Detectamos tus movimientos',
    descripcion: 'Bancolombia, Davivienda y RappiCard. Más bancos próximamente.',
  },
  {
    Icon: BarChart2,
    titulo: 'Ves tus finanzas al instante',
    descripcion: 'Gastos, ingresos, presupuesto y consejos automáticos.',
  },
]

export default function LandingPage() {
  const supabase = createClient()

  const handleLoginGmail = async () => {
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

  const handleLoginOutlook = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        scopes: 'openid profile email Mail.Read offline_access User.Read',
        queryParams: {
          prompt: 'select_account',
        },
      },
    })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-lg mx-auto">
        <Logo />
        <ThemeToggle />
      </nav>

      <main className="max-w-lg mx-auto px-6 pb-16">

        {/* ── Hero ───────────────────────────────────────── */}
        <section className="text-center py-12">
          <h1
            className="tracking-tight"
            style={{ fontSize: 'var(--text-4xl)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 16 }}
          >
            Tu plata,{' '}
            <span style={{ color: 'var(--green)' }}>clara.</span>
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto 32px' }}>
            Conecta tu correo y BilleteClaro detecta automáticamente tus movimientos bancarios. Sin ingresar nada a mano.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleLoginGmail}
              data-testid={TEST_IDS.AUTH_GOOGLE_BUTTON}
              aria-label="Entrar con Gmail"
              className="w-full flex items-center justify-center gap-3 font-medium transition-opacity hover:opacity-90 active:scale-95"
              style={{
                background: 'var(--text)',
                color: 'var(--bg)',
                padding: '14px 24px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-base)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <GoogleIcon />
              Entrar con Gmail
            </button>
            <button
              onClick={handleLoginOutlook}
              aria-label="Entrar con Outlook"
              className="w-full flex items-center justify-center gap-3 font-medium transition-opacity hover:opacity-80 active:scale-95"
              style={{
                background: 'transparent',
                color: 'var(--text)',
                padding: '14px 24px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-base)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <OutlookIcon />
              Entrar con Outlook
            </button>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginTop: 10 }}>
            Gratis. Sin tarjeta. Sin trampa.
          </p>
        </section>

        {/* ── Cómo funciona ──────────────────────────────── */}
        <section style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20, textAlign: 'center' }}>
            Cómo funciona
          </p>
          <div className="flex flex-col gap-4">
            {STEPS.map(({ Icon, titulo, descripcion }, i) => (
              <div
                key={titulo}
                className="flex items-start gap-4"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px 18px',
                }}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 36, height: 36,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--green-soft)',
                    color: 'var(--green)',
                  }}
                >
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-subtle)' }}>
                      {i + 1}
                    </span>
                    <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
                      {titulo}
                    </p>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {descripcion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── ¿Es seguro? ────────────────────────────────── */}
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            marginBottom: 40,
          }}
        >
          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            🔒 ¿Es seguro?
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Solo pedimos permiso de <strong style={{ color: 'var(--text)' }}>lectura</strong>. Nunca escribimos ni enviamos nada en tu nombre. Tus datos se guardan cifrados en servidores de Supabase (AWS us-east-1).
          </p>
        </section>

      </main>
    </div>
  )
}
