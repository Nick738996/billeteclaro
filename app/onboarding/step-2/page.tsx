'use client'

import { useRouter } from 'next/navigation'
import ForwardingWizard from '@/components/dashboard/ForwardingWizard'

export default function OnboardingStep2() {
  const router = useRouter()
  return (
    <ForwardingWizard
      eyebrow="Paso 2 de 3"
      onDone={() => router.push('/onboarding/step-3')}
      onSkip={() => router.push('/onboarding/step-3')}
    />
  )
}
