'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ForwardingWizard from '@/components/dashboard/ForwardingWizard'

export default function ForwardingPageClient() {
  const router = useRouter()
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="max-w-lg mx-auto px-6 py-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 transition-opacity hover:opacity-70"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft size={16} />
          Volver al dashboard
        </button>
      </nav>
      <main className="max-w-lg mx-auto px-6 py-4">
        <ForwardingWizard onDone={() => router.push('/dashboard')} />
      </main>
    </div>
  )
}
