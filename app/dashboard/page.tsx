import { redirect } from 'next/navigation'
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Transaction, MonthlyStats, Categoria } from '@/lib/types'
import { isIngreso } from '@/lib/types'
import DashboardClient from './DashboardClient'

interface Props {
  searchParams: { month?: string }
}

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const monthParam = searchParams.month ?? format(new Date(), 'yyyy-MM')
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

  const gastos = txs
    .filter((t) => !isIngreso(t.tipo))
    .reduce((s, t) => s + t.monto, 0)

  const ingresos = txs
    .filter((t) => isIngreso(t.tipo))
    .reduce((s, t) => s + t.monto, 0)

  const porCategoria = txs
    .filter((t) => !isIngreso(t.tipo))
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.categoria] = (acc[t.categoria] ?? 0) + t.monto
      return acc
    }, {})

  const stats: MonthlyStats = {
    gastos,
    ingresos,
    balance: ingresos - gastos,
    transacciones: txs.length,
    porCategoria: porCategoria as Record<Categoria, number>,
  }

  const prevMonth = format(subMonths(ref, 1), 'yyyy-MM')
  const nextMonth = format(addMonths(ref, 1), 'yyyy-MM')
  const currentMonth = format(new Date(), 'yyyy-MM')
  const isCurrentMonth = monthParam === currentMonth

  const monthLabel = format(ref, 'MMMM yyyy', { locale: es })

  return (
    <DashboardClient
      user={{ name: user.user_metadata?.full_name ?? user.email ?? 'Usuario' }}
      transactions={txs}
      stats={stats}
      monthLabel={monthLabel}
      currentMonth={monthParam}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      isCurrentMonth={isCurrentMonth}
      gmailConnected={gmailConnected}
    />
  )
}
