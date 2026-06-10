'use client'

import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ui/ThemeToggle'

const Logo = () => (
  <div className="flex items-center gap-2">
    <svg viewBox="0 0 100 100" width="36" height="36" aria-hidden="true" style={{ color: 'var(--text)' }}>
      <rect width="100" height="100" rx="17" style={{ fill: 'var(--surface)' }}/>
      <line x1="30" y1="18" x2="30" y2="82" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
      <path d="M30,18 Q70,18 70,34 Q70,50 30,50" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <path d="M30,50 Q78,50 78,66 Q78,82 30,82" stroke="var(--green)" strokeWidth="6" fill="none" strokeLinecap="round"/>
    </svg>
    <span style={{ fontSize: 'var(--text-base)', letterSpacing: '-0.02em' }}>
      <span style={{ fontWeight: 400, color: 'var(--text)' }}>Billete</span>
      <span style={{ fontWeight: 700, color: 'var(--green)' }}>Claro</span>
    </span>
  </div>
)

function getStep(pathname: string): number {
  if (pathname.includes('step-3')) return 3
  if (pathname.includes('step-2')) return 2
  return 1
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const step = getStep(pathname)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <nav className="flex items-center justify-between px-6 py-4 max-w-lg mx-auto w-full">
        <Logo />
        <ThemeToggle />
      </nav>

      {/* Progress */}
      <div className="flex items-center justify-center gap-2 pb-2">
        {[1, 2, 3].map(n => (
          <div
            key={n}
            style={{
              width: n === step ? 22 : 6,
              height: 6,
              borderRadius: 3,
              background: n <= step ? 'var(--green)' : 'var(--border)',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>

      <main className="flex-1 max-w-lg mx-auto px-6 py-8 w-full">
        {children}
      </main>
    </div>
  )
}
