'use client'

import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ui/ThemeToggle'
import Logo from '@/components/ui/Logo'

function getStep(pathname: string): number {
  if (pathname.includes('step-3')) return 3
  if (pathname.includes('step-2')) return 2
  return 1
}

export default function OnboardingLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const step = getStep(pathname)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <nav className="flex items-center justify-between px-6 py-4 max-w-lg mx-auto w-full">
        <Logo size={36} textSize="var(--text-base)" />
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
