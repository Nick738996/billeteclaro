import type { Metadata } from 'next'
import LandingPage from '@/components/landing/LandingPage'

export const metadata: Metadata = {
  title: 'BilleteClaro — Tu radar financiero personal',
  description: 'Tu plata, clara. BilleteClaro lee tus correos de RappiCard, RappiPay y Bancolombia automáticamente y te muestra en qué gastas. Gratis para colombianos.',
  alternates: { canonical: 'https://www.billeteclaro.com' },
}

export default function Page() {
  return <LandingPage />
}
