'use client'

// MEJORAS aplicadas en este archivo:
// ⑤ MonthNav: botones w-8 h-8 (32px) → w-11 h-11 (44px) [touch target mínimo]
// Estado `activeFilter` compartido entre SpendingChart y TransactionsList

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Transaction, MonthlyStats, Categoria } from '@/lib/types'
import { isIngreso, isGasto } from '@/lib/types'
import StatsCards from '@/components/dashboard/StatsCards'
import SpendingChart from '@/components/dashboard/SpendingChart'
import TransactionsList from '@/components/dashboard/TransactionsList'
import HeaderPill from '@/components/dashboard/HeaderPill'

interface Props {
  user: { name: string }
  transactions: Transaction[]
  monthLabel: string
  currentMonth: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  gmailConnected: boolean
}

function buildStats(txs: Transaction[]): MonthlyStats {
  const gastos = txs.filter(t => isGasto(t.tipo)).reduce((s, t) => s + t.monto, 0)
  const ingresos = txs.filter(t => isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0)
  const porCategoria = txs
    .filter(t => isGasto(t.tipo))
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
  monthLabel: initLabel,
  currentMonth: initMonth,
  isCurrentMonth: initIsCurrent,
  gmailConnected,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const today = format(new Date(), 'yyyy-MM')

  const [month, setMonth] = useState(initMonth)
  const [txs, setTxs] = useState(initTxs)
  const [label, setLabel] = useState(initLabel)
  const [isCurrent, setIsCurrent] = useState(initIsCurrent)
  const [loading, setLoading] = useState(false)

  // Estado compartido entre SpendingChart y TransactionsList
  const [activeFilter, setActiveFilter] = useState<string>('TODOS')

  const stats = useMemo(() => buildStats(txs), [txs])

  const monthRef = parseISO(`${month}-01`)
  const prevMonth = format(subMonths(monthRef, 1), 'yyyy-MM')
  const nextMonth = format(addMonths(monthRef, 1), 'yyyy-MM')

  const loadMonth = useCallback(async (m: string) => {
    setLoading(true)
    setActiveFilter('TODOS') // reset filter on month change
    const r = parseISO(`${m}-01`)
    const start = startOfMonth(r)
    const end = endOfMonth(r)

    const { data } = await supabase
      .from('transactions')
      .select('*')
      .gte('fecha', start.toISOString())
      .lte('fecha', end.toISOString())
      .order('fecha', { ascending: false })

    setTxs((data ?? []) as Transaction[])
    setLabel(format(r, 'MMMM yyyy', { locale: es }))
    setIsCurrent(m === today)
    setMonth(m)
    setLoading(false)
  }, [supabase, today])

  const navigate = (m: string) => {
    window.history.pushState(null, '', `/dashboard?month=${m}`)
    loadMonth(m)
  }

  const handleSyncComplete = () => loadMonth(month)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const firstName = user.name.split(' ')[0]

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
        }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo lockup — Variante A (La B)
               stroke="currentColor" + color:var(--text) = adapta auto en light/dark */}
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 100 100" width="26" height="26"
              aria-hidden="true"
              style={{ color: 'var(--text)' }}
            >
              <line x1="30" y1="18" x2="30" y2="82"
                stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
              <path d="M30,18 Q70,18 70,34 Q70,50 30,50"
                stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
              <path d="M30,50 Q78,50 78,66 Q78,82 30,82"
                stroke="#4ADE80" strokeWidth="6" fill="none" strokeLinecap="round"/>
            </svg>
            <span className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-base)', letterSpacing: '-0.02em' }}>
              <span style={{ fontWeight: 300, color: 'var(--text)' }}>Billete</span>
              <span style={{ fontWeight: 700, color: 'var(--green)' }}>Claro</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
          <HeaderPill onSyncComplete={handleSyncComplete} onSignOut={handleSignOut}/>
          </div>
        </div>
      </header>

      {/* Main */}
      <main
        className={`max-w-lg mx-auto px-4 py-6 space-y-6 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : ''}`}
      >
        {/* Saludo + navegación de mes */}
        <div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Hola, {firstName}
          </p>
          <div className="flex items-center justify-between mt-1">
            {/* MEJORA ⑤: w-8 h-8 → w-11 h-11 para touch target de 44px */}
            <button
              onClick={() => navigate(prevMonth)}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronLeft size={18} />
            </button>

            <h1
              className="font-semibold capitalize"
              style={{ fontSize: 'var(--text-xl)', color: 'var(--text)' }}
            >
              {label}
            </h1>

            <button
              onClick={() => navigate(nextMonth)}
              disabled={isCurrent}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Alert Gmail no conectado */}
        {!gmailConnected && (
          <a
            href="/api/auth/gmail-connect"
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
            style={{
              background: 'var(--yellow-soft)',
              borderLeft: '3px solid var(--yellow)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
            }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--yellow)', flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                Gmail no conectado
              </p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                Toca aquí para conectar tu cuenta y sincronizar.
              </p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </a>
        )}

        <StatsCards stats={stats} />

        {/* SpendingChart y TransactionsList comparten activeFilter */}
        <SpendingChart
          transactions={txs}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        <div className="flex items-center justify-between px-1">
          <h2 className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
            Transacciones
          </h2>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {txs.length} en total
          </span>
        </div>

        <TransactionsList
          transactions={txs}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </main>
    </div>
  )
}
