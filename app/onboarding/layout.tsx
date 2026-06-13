import type { Metadata } from 'next'
import OnboardingLayoutClient from './_OnboardingLayoutClient'

export const metadata: Metadata = {
  title: 'Comenzar',
  robots: { index: false, follow: false },
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingLayoutClient>{children}</OnboardingLayoutClient>
}
