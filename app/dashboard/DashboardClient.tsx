'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { Transaction, MonthlyStats, Categoria } from '@/lib/types'
import { isIngreso } from '@/lib/types'
import StatsCards from '@/components/dashboard/StatsCards'
import SpendingChart from '@/components/dashboard/SpendingChart'
import TransactionsList from '@/components/dashboard/TransactionsList'
import SyncButton from '@/components/dashboard/SyncButton'

interface Props {
  user: { name: string }
  transactions: Transaction[]
  stats: MonthlyStats
  monthLabel: string
  currentMonth: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  /** Si se provee, la navegación filtra localmente sin tocar Supabase (modo demo) */
  allTransactions?: Transaction[]
}

function buildStats(txs: Transaction[]): MonthlyStats {
  const gastos = txs.filter(t => !isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0)
  const ingresos = txs.filter(t => isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0)
  const porCategoria = txs
    .filter(t => !isIngreso(t.tipo))
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.categoria] = (acc[t.categoria] ?? 0) + t.monto
      return acc
    }, {})
  return {
    gastos,
    ingresos,
    balance: ingresos - gastos,
    transacciones: txs.length,
    porCategoria: porCategoria as Record<Categoria, number>,
  }
}

export default function DashboardClient({
  user,
  transactions: initTxs,
  stats: initStats,
  monthLabel: initLabel,
  currentMonth: initMonth,
  isCurrentMonth: initIsCurrent,
  allTransactions,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const today = format(new Date(), 'yyyy-MM')
  const demoMode = allTransactions !== undefined

  // All display data lives in client state — never depends on server re-renders
  const [month, setMonth] = useState(initMonth)
  const [txs, setTxs] = useState(initTxs)
  const [stats, setStats] = useState(initStats)
  const [label, setLabel] = useState(initLabel)
  const [isCurrent, setIsCurrent] = useState(initIsCurrent)
  const [loading, setLoading] = useState(false)

  const monthRef = parseISO(`${month}-01`)
  const prevMonth = format(subMonths(monthRef, 1), 'yyyy-MM')
  const nextMonth = format(addMonths(monthRef, 1), 'yyyy-MM')

  const loadMonth = useCallback(async (m: string) => {
    setLoading(true)
    const r = parseISO(`${m}-01`)
    const start = startOfMonth(r)
    const end = endOfMonth(r)

    let newTxs: Transaction[]

    if (demoMode) {
      // Modo demo: filtra los datos estáticos localmente, sin tocar Supabase
      newTxs = (allTransactions ?? [])
        .filter(t => {
          const f = new Date(t.fecha)
          return f >= start && f <= end
        })
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    } else {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .gte('fecha', start.toISOString())
        .lte('fecha', end.toISOString())
        .order('fecha', { ascending: false })
      newTxs = (data ?? []) as Transaction[]
    }

    setTxs(newTxs)
    setStats(buildStats(newTxs))
    setLabel(format(r, 'MMMM yyyy', { locale: es }))
    setIsCurrent(m === today)
    setMonth(m)
    setLoading(false)
  }, [supabase, today, demoMode, allTransactions])

  const navigate = (m: string) => {
    if (!demoMode) {
      window.history.pushState(null, '', `/dashboard?month=${m}`)
    }
    loadMonth(m)
  }

  const handleSyncComplete = () => loadMonth(month)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const firstName = user.name.split(' ')[0]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-semibold text-slate-800 text-sm">BilleteClaro</span>
          </div>

          <div className="flex items-center gap-2">
            <SyncButton onSyncComplete={handleSyncComplete} />
            <button
              onClick={handleSignOut}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              title="Cerrar sesión"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={`max-w-lg mx-auto px-4 py-6 space-y-4 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
        {/* Greeting + month nav */}
        <div>
          <p className="text-slate-500 text-sm">Hola, {firstName}</p>
          <div className="flex items-center justify-between mt-1">
            <button
              onClick={() => navigate(prevMonth)}
              className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <h1 className="text-xl font-bold text-slate-900 capitalize">{label}</h1>

            <button
              onClick={() => navigate(nextMonth)}
              disabled={isCurrent}
              className="w-8 h-8 rounded-full hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <StatsCards stats={stats} />
        <SpendingChart transactions={txs} />

        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-700">Transacciones</h2>
          <span className="text-xs text-slate-400">{txs.length} en total</span>
        </div>

        <TransactionsList transactions={txs} />
      </main>
    </div>
  )
}
