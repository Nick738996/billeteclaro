import { redirect } from 'next/navigation'
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Transaction } from '@/lib/types'
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
  const start = startOfMonth(ref)
  const end = endOfMonth(ref)

  const admin = createAdminClient()
  const { data: tokenRow } = await admin
    .from('user_tokens')
    .select('gmail_refresh_token')
    .eq('user_id', user.id)
    .single()
  const gmailConnected = !!tokenRow?.gmail_refresh_token

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .gte('fecha', start.toISOString())
    .lte('fecha', end.toISOString())
    .order('fecha', { ascending: false })

  const txs: Transaction[] = transactions ?? []

  const prevMonth = format(subMonths(ref, 1), 'yyyy-MM')
  const nextMonth = format(addMonths(ref, 1), 'yyyy-MM')
  const currentMonth = format(new Date(), 'yyyy-MM')
  const isCurrentMonth = monthParam === currentMonth

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
      gmailConnected={gmailConnected}
    />
  )
}
