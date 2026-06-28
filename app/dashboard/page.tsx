import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Tu dashboard financiero personal.',
  robots: { index: false, follow: false },
}
import { format, parseISO, addMonths, subMonths, isBefore, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/server'
import type { Transaction } from '@/lib/types'
import { getTourCompleted } from '@/lib/services/settingsService'
import DashboardClient from './DashboardClient'

// Never cache — data changes after each sync and on month navigation
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ month?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { month } = await searchParams
  const monthParam = month ?? format(new Date(), 'yyyy-MM')
  const ref = parseISO(`${monthParam}-01`)

  const tourCompleted = await getTourCompleted(supabase, user.id)

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .eq('mes_contable', monthParam)
    .order('fecha', { ascending: false })

  const txs: Transaction[] = transactions ?? []

  const prevMonth = format(subMonths(ref, 1), 'yyyy-MM')
  const nextMonth = format(addMonths(ref, 1), 'yyyy-MM')
  const currentMonth = format(new Date(), 'yyyy-MM')
  const isCurrentMonth = monthParam === currentMonth
  // Permitir navegar hasta 1 mes calendario adelante del mes actual
  // (cubre el caso de sueldo al final del mes que mueve transacciones al mes siguiente)
  const maxAllowedMonth = format(addMonths(startOfMonth(new Date()), 1), 'yyyy-MM')
  const canGoNext = nextMonth <= maxAllowedMonth

  const monthLabel = format(ref, 'MMMM yyyy', { locale: es })

  return (
    <DashboardClient
      user={{ name: user.user_metadata?.full_name ?? user.email ?? 'Usuario' }}
      transactions={txs}
      monthLabel={monthLabel}
      currentMonth={monthParam}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      isCurrentMonth={isCurrentMonth}
      canGoNext={canGoNext}
      tourCompleted={tourCompleted}
    />
  )
}
