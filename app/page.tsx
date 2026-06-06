'use client'

import { createClient } from '@/lib/supabase/client'

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
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center">
            <svg
              className="w-9 h-9 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              BilleteClaro
            </h1>
            <p className="text-slate-500 text-sm mt-1">Tu radar financiero personal</p>
          </div>
        </div>

        {/* Value props */}
        <div className="w-full space-y-3">
          {[
            { text: 'Lee automáticamente tus correos de banco' },
            { text: 'Extrae cada transacción sin que hagas nada' },
            { text: 'Categoriza con IA y muestra tu resumen' },
          ].map(({ text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-3 h-3 text-brand-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <span className="text-slate-700 text-sm">{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-white font-medium py-3.5 px-6 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#fff"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                opacity=".85"
              />
              <path
                fill="#fff"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                opacity=".75"
              />
              <path
                fill="#fff"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                opacity=".65"
              />
              <path
                fill="#fff"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                opacity=".55"
              />
            </svg>
            Conectar con Google
          </button>
          <p className="text-xs text-slate-400 text-center">
            Solo lectura de correos. Nunca enviamos mensajes en tu nombre.
          </p>
        </div>
      </div>
    </main>
  )
}
