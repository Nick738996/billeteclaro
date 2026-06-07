'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Transaction, MonthlyStats } from '@/lib/types'
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
  gmailConnected: boolean
}

export default function DashboardClient({
  user,
  transactions,
  stats,
  monthLabel,
  currentMonth,
  prevMonth,
  nextMonth,
  isCurrentMonth,
  gmailConnected,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleSyncComplete = () => {
    startTransition(() => {
      router.refresh()
    })
  }

  const navigate = (month: string) => {
    router.push(`/dashboard?month=${month}`)
  }

  // First name only
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
      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
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

            <h1 className="text-xl font-bold text-slate-900 capitalize">{monthLabel}</h1>

            <button
              onClick={() => navigate(nextMonth)}
              disabled={isCurrentMonth}
              className="w-8 h-8 rounded-full hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {!gmailConnected && (
          <a
            href="/api/auth/gmail-connect"
            className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Gmail no conectado</p>
              <p className="text-xs text-amber-600 mt-0.5">Toca aquí para conectar tu cuenta y poder sincronizar.</p>
            </div>
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        )}

        <StatsCards stats={stats} />
        <SpendingChart transactions={transactions} />

        {/* Transactions header */}
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-700">Transacciones</h2>
          <span className="text-xs text-slate-400">{transactions.length} en total</span>
        </div>

        <TransactionsList transactions={transactions} />
      </main>
    </div>
  )
}
