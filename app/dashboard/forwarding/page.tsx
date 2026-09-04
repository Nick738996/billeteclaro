import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ForwardingPageClient from './ForwardingPageClient'

export const metadata: Metadata = {
  title: 'Reenvío de correo',
  robots: { index: false, follow: false },
}

export default async function ForwardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return <ForwardingPageClient />
}
