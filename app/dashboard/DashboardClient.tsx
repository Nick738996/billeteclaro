'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, AlertTriangle, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Transaction, MonthlyStats, Categoria } from '@/lib/types'
import { isIngreso, isGasto } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import MonthHero from '@/components/dashboard/MonthHero'
import BudgetOverview from '@/components/dashboard/BudgetOverview'
import SpendingChart from '@/components/dashboard/SpendingChart'
import TransactionsList from '@/components/dashboard/TransactionsList'
import HeaderPill from '@/components/dashboard/HeaderPill'
import AIAdvisorPanel from '@/components/dashboard/AIAdvisorPanel'
import ManualTransactions from '@/components/dashboard/ManualTransactions'
import TourTooltip from '@/components/tour/TourTooltip'
import HelpModal from '@/components/tour/HelpModal'
import { useTour } from '@/hooks/useTour'
import { TOUR_STEPS } from '@/lib/tour/tourSteps'

interface Props {
  user: { name: string }
  transactions: Transaction[]
  monthLabel: string
  currentMonth: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  gmailConnected: boolean
  tourCompleted: boolean
}

function buildStats(txs: Transaction[]): MonthlyStats {
  const gastosTxs    = txs.filter(t => isGasto(t.tipo, t.categoria))
  const gastos       = gastosTxs.reduce((s, t) => s + t.monto, 0)
  const gastosReales = gastos
  const ingresos     = txs.filter(t => isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0)
  const ahorros      = txs.filter(t => t.categoria === 'AHORROS').reduce((s, t) => s + t.monto, 0)
  const porCategoria = gastosTxs.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoria] = (acc[t.categoria] ?? 0) + t.monto
    return acc
  }, {})
  return {
    gastos,
    gastosReales,
    ingresos,
    ahorros,
    balance: ingresos - gastosReales - ahorros,
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
  tourCompleted,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const today = format(new Date(), 'yyyy-MM')

  const [month, setMonth] = useState(initMonth)
  const [txs, setTxs] = useState(initTxs)
  const [label, setLabel] = useState(initLabel)
  const [isCurrent, setIsCurrent] = useState(initIsCurrent)
  const [loading, setLoading] = useState(false)

  const [activeFilter, setActiveFilter] = useState<string>('TODOS')
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [showChart, setShowChart] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)

  // Versión de contexto: sube cada vez que cambian datos relevantes para el asesor
  const [contextVersion, setContextVersion] = useState(0)
  const bumpContext = useCallback(() => setContextVersion(v => v + 1), [])

  const tour = useTour()

  // Auto-activar tour al primer login (si no fue completado)
  const hasAutoStartedRef = useRef(false)
  useEffect(() => {
    if (tourCompleted || hasAutoStartedRef.current) return
    hasAutoStartedRef.current = true
    const timer = setTimeout(() => tour.startTour(), 800)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleHelp = useCallback(() => {
    if (tourCompleted) {
      setShowHelpModal(true)
    } else {
      tour.startTour()
    }
  }, [tourCompleted, tour])

  const stats = useMemo(() => buildStats(txs), [txs])

  const monthRef = parseISO(`${month}-01`)
  const prevMonth = format(subMonths(monthRef, 1), 'yyyy-MM')
  const nextMonth = format(addMonths(monthRef, 1), 'yyyy-MM')

  const loadMonth = useCallback(async (m: string) => {
    setLoading(true)
    setActiveFilter('TODOS') // reset filter on month change

    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('mes_contable', m)
      .order('fecha', { ascending: false })

    setTxs((data ?? []) as Transaction[])
    setLabel(format(parseISO(`${m}-01`), 'MMMM yyyy', { locale: es }))
    setIsCurrent(m === today)
    setMonth(m)
    setLoading(false)
  }, [supabase, today])

  const navigate = (m: string) => {
    window.history.pushState(null, '', `/dashboard?month=${m}`)
    loadMonth(m)
  }

  const handleSyncComplete = () => { loadMonth(month); bumpContext() }

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
              viewBox="0 0 100 100" width="45" height="45"
              aria-hidden="true"
              style={{ color: 'var(--text)' }}
            >
              <line x1="30" y1="18" x2="30" y2="82"
                stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
              <path d="M30,18 Q70,18 70,34 Q70,50 30,50"
                stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
              <path d="M30,50 Q78,50 78,66 Q78,82 30,82"
                stroke="var(--green)" strokeWidth="6" fill="none" strokeLinecap="round"/>
            </svg>
            <span className="tracking-tight" style={{ fontSize: 'var(--text-lg)', letterSpacing: '-0.02em' }}>
              <span style={{ fontWeight: 400, color: 'var(--text)' }}>Billete</span>
              <span style={{ fontWeight: 700, color: 'var(--green)' }}>Claro</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
          <HeaderPill onSyncComplete={handleSyncComplete} onSignOut={handleSignOut} onHelp={handleHelp}/>
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
              data-testid={TEST_IDS.DASHBOARD_MONTH_PREV}
              aria-label="Mes anterior"
              className="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronLeft size={18} />
            </button>

            <h1
              className="font-semibold capitalize"
              aria-live="polite"
              style={{ fontSize: 'var(--text-xl)', color: 'var(--text)' }}
            >
              {label}
            </h1>

            <button
              onClick={() => navigate(nextMonth)}
              disabled={isCurrent}
              data-testid={TEST_IDS.DASHBOARD_MONTH_NEXT}
              aria-label="Mes siguiente"
              aria-disabled={isCurrent}
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

        <MonthHero
          gastos={stats.gastos}
          ingresos={stats.ingresos}
          ahorros={stats.ahorros}
          transacciones={stats.transacciones}
          mes={month}
          showChart={showChart}
          onChartToggle={() => setShowChart(v => !v)}
        />

        {showChart && (
          <SpendingChart
            transactions={txs}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        )}

        <div data-testid="tour-budget">
          <BudgetOverview
            mes={month}
            gastosPorCategoria={stats.porCategoria}
            onBudgetsChange={setBudgets}
            onSaved={bumpContext}
          />
        </div>

        <div data-testid="tour-advisor">
          <AIAdvisorPanel
            mes={month}
            budgetCount={Object.values(budgets).filter(v => v > 0).length}
            txCount={txs.length}
            contextVersion={contextVersion}
          />
        </div>

        <div data-testid="tour-transactions">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
              Transacciones
            </h2>
            <button
              onClick={() => setManualOpen(v => !v)}
              className="flex items-center gap-1"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                padding: '4px 0',
              }}
            >
              <Plus size={12} />
              Agregar
            </button>
          </div>

          {manualOpen && (
            <ManualTransactions
              onSaved={() => { loadMonth(month); bumpContext() }}
              onClose={() => setManualOpen(false)}
            />
          )}

          <TransactionsList
            transactions={txs}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onCategoriesUpdated={() => { loadMonth(month); bumpContext() }}
            onTransactionDeleted={() => { loadMonth(month); bumpContext() }}
          />
        </div>
      </main>

      {/* Product tour */}
      {tour.isActive && (
        <TourTooltip
          step={TOUR_STEPS[tour.currentStep]}
          stepIndex={tour.currentStep}
          onNext={tour.nextStep}
          onPrev={tour.prevStep}
          onSkip={tour.skipTour}
          onComplete={tour.completeTour}
        />
      )}

      {/* Help modal */}
      {showHelpModal && (
        <HelpModal
          onClose={() => setShowHelpModal(false)}
          onStartTour={() => { setShowHelpModal(false); tour.startTour() }}
        />
      )}
    </div>
  )
}
