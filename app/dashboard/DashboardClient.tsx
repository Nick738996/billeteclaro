'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, addMonths, subMonths, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import SavingsOverview from '@/components/dashboard/SavingsOverview'
import ManualTransactions from '@/components/dashboard/ManualTransactions'
import TourTooltip from '@/components/tour/TourTooltip'
import HelpModal from '@/components/tour/HelpModal'
import { useTour } from '@/hooks/useTour'
import { TOUR_STEPS } from '@/lib/tour/tourSteps'
import styles from './DashboardClient.module.css'

// Deshabilitado temporalmente — el asesor necesita más trabajo antes de estar listo
const FEATURE_AI_ADVISOR = false

interface Props {
  user: { name: string }
  transactions: Transaction[]
  monthLabel: string
  currentMonth: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  canGoNext: boolean
  tourCompleted: boolean
}

function buildStats(txs: Transaction[]): MonthlyStats {
  // AHORROS, PRESTAMO, DEUDA y TRANSFERENCIA (salientes) cuentan como salidas del mes
  const gastosTxs = txs.filter(t => isGasto(t.tipo, t.categoria) || t.categoria === 'AHORROS' || t.categoria === 'PRESTAMO' || t.categoria === 'DEUDA' || (t.categoria === 'TRANSFERENCIA' && !isIngreso(t.tipo)))
  const gastos    = gastosTxs.reduce((s, t) => s + t.monto, 0)
  const ingresos  = txs.filter(t => isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0)
  const ahorros   = txs.filter(t => t.categoria === 'AHORROS').reduce((s, t) => s + t.monto, 0)
  const porCategoria = gastosTxs.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoria] = (acc[t.categoria] ?? 0) + t.monto
    return acc
  }, {})
  return {
    gastos,
    gastosReales: gastos,
    ingresos,
    ahorros,
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
  canGoNext: initCanGoNext,
  tourCompleted,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const today = format(new Date(), 'yyyy-MM')

  const [month, setMonth] = useState(initMonth)
  const [txs, setTxs] = useState(initTxs)
  const [label, setLabel] = useState(initLabel)
  const [isCurrent, setIsCurrent] = useState(initIsCurrent)
  const [canGoNext, setCanGoNext] = useState(initCanGoNext)
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

    const nextM = format(addMonths(parseISO(`${m}-01`), 1), 'yyyy-MM')
    const maxAllowedMonth = format(addMonths(startOfMonth(new Date()), 1), 'yyyy-MM')

    const [{ data }] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('mes_contable', m)
        .order('fecha', { ascending: false }),
    ])

    setTxs((data ?? []) as Transaction[])
    setLabel(format(parseISO(`${m}-01`), 'MMMM yyyy', { locale: es }))
    setIsCurrent(m === today)
    setCanGoNext(nextM <= maxAllowedMonth)
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

  const firstName = user.name !== 'Usuario' ? user.name.split(' ')[0] : ''

  return (
    <div className={styles.root}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {/* Logo lockup — Variante A (La B)
               stroke="currentColor" + color:var(--text) = adapta auto en light/dark */}
          <div className={styles.logoGroup}>
            <svg
              viewBox="0 0 100 100" width="45" height="45"
              aria-hidden="true"
              className={styles.logoSvg}
            >
              <line x1="30" y1="18" x2="30" y2="82"
                stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
              <path d="M30,18 Q70,18 70,34 Q70,50 30,50"
                stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
              <path d="M30,50 Q78,50 78,66 Q78,82 30,82"
                stroke="var(--green)" strokeWidth="6" fill="none" strokeLinecap="round"/>
            </svg>
            <span className={styles.logoText}>
              <span className={styles.logoWordLight}>Billete</span>
              <span className={styles.logoWordBold}>Claro</span>
            </span>
          </div>
          <div className={styles.headerActions}>
            <HeaderPill onSyncComplete={handleSyncComplete} onSignOut={handleSignOut} onHelp={handleHelp}/>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className={`${styles.main} ${loading ? styles.mainLoading : ''}`}>
        {/* Saludo + navegación de mes */}
        <div>
          <p className={styles.greeting}>
            {firstName ? `Hola, ${firstName}` : 'Hola'}
          </p>
          <div className={styles.monthNavRow}>
            {/* MEJORA ⑤: w-8 h-8 → w-11 h-11 para touch target de 44px */}
            <button
              onClick={() => navigate(prevMonth)}
              data-testid={TEST_IDS.DASHBOARD_MONTH_PREV}
              aria-label="Mes anterior"
              className={styles.navBtn}
            >
              <ChevronLeft size={18} />
            </button>

            <h1
              className={styles.monthTitle}
              aria-live="polite"
            >
              {label}
            </h1>

            <button
              onClick={() => navigate(nextMonth)}
              disabled={!canGoNext}
              data-testid={TEST_IDS.DASHBOARD_MONTH_NEXT}
              aria-label="Mes siguiente"
              aria-disabled={!canGoNext}
              className={styles.navBtn}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>


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

        <SavingsOverview />

        <div data-testid="tour-budget">
          <BudgetOverview
            mes={month}
            gastosPorCategoria={stats.porCategoria}
            ingresos={stats.ingresos}
            onBudgetsChange={setBudgets}
            onSaved={bumpContext}
          />
        </div>

        {FEATURE_AI_ADVISOR && (
          <div data-testid="tour-advisor">
            <AIAdvisorPanel
              mes={month}
              budgetCount={Object.values(budgets).filter(v => v > 0).length}
              txCount={txs.length}
              contextVersion={contextVersion}
            />
          </div>
        )}

        <div data-testid="tour-transactions">
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
            onCategoryChange={() => loadMonth(month)}
            onTransactionDeleted={() => { loadMonth(month); bumpContext() }}
            onAdd={() => setManualOpen(v => !v)}
            budgets={budgets}
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
