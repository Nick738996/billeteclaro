'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, addMonths, subMonths, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Transaction, Capa } from '@/lib/types'
import { computeLayerTotals } from '@/lib/services/layerService'
import { TEST_IDS } from '@/lib/testIds'
import MonthHero from '@/components/dashboard/MonthHero'
import WeeklyAllowanceCard from '@/components/dashboard/WeeklyAllowanceCard'
import CategoriesCard from '@/components/dashboard/CategoriesCard'
import TransactionsList from '@/components/dashboard/TransactionsList'
import HeaderPill from '@/components/dashboard/HeaderPill'
import AIAdvisorPanel from '@/components/dashboard/AIAdvisorPanel'
import ManualTransactions from '@/components/dashboard/ManualTransactions'
import CategoryManager from '@/components/dashboard/CategoryManager'
import TourTooltip from '@/components/tour/TourTooltip'
import HelpModal from '@/components/tour/HelpModal'
import Logo from '@/components/ui/Logo'
import { useTour } from '@/hooks/useTour'
import { TOUR_STEPS } from '@/lib/tour/tourSteps'
import { FEATURE_AI_ADVISOR } from '@/lib/features'
import styles from './DashboardClient.module.css'

interface Props {
  user: { id: string; name: string }
  transactions: Transaction[]
  monthLabel: string
  currentMonth: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  canGoNext: boolean
  tourCompleted: boolean
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
  const [manualOpen, setManualOpen] = useState(false)
  const [catManagerOpen, setCatManagerOpen] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)

  // Versión de contexto: sube cada vez que cambian datos relevantes para el asesor
  const [contextVersion, setContextVersion] = useState(0)
  const bumpContext = useCallback(() => setContextVersion(v => v + 1), [])

  // Sube cada vez que borrar una transacción pudo revertir un saldo de ahorro
  // (ver deleteTransaction), para forzar el refetch de SavingsOverview.
  const [savingsRefresh, setSavingsRefresh] = useState(0)
  const bumpSavingsRefresh = useCallback(() => setSavingsRefresh(v => v + 1), [])

  // Las transacciones llegan solas por reenvío (push, no pull) — sin esto el
  // usuario tendría que recargar la página a mano para verlas. Se suscribe a
  // cambios en tiempo real en `transactions` para este usuario; si la fila
  // pertenece al mes que se está viendo, refresca y muestra un aviso breve.
  const [justUpdated, setJustUpdated] = useState(false)
  useEffect(() => {
    const channel = supabase
      .channel(`transactions-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { mes_contable?: string } | null
          if (row?.mes_contable !== month) return
          loadMonth(month)
          bumpContext()
          setJustUpdated(true)
          setTimeout(() => setJustUpdated(false), 4000)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, month])

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

  // Overrides de capa por categoría (custom o built-in reclasificadas) — una
  // sola fuente para el hero, Tu Plan y la lista, así los tres cuadran.
  const [capaOverrides, setCapaOverrides] = useState<Record<string, Capa>>({})
  const loadCapas = useCallback(() => {
    fetch('/api/category-capas')
      .then(r => r.json())
      .then(d => setCapaOverrides(d.overrides ?? {}))
      .catch(() => setCapaOverrides({}))
  }, [])
  useEffect(() => { loadCapas() }, [loadCapas])

  // "Gastaste" = Fijo + Variable, lo mismo que suman las columnas de Tu Plan.
  // Antes sumaba también pagos de tarjeta (las compras ya estaban contadas una
  // por una), préstamos y transferencias sin categorizar — inflaba el número
  // sin que se pudiera reconstruir desde ninguna otra parte de la pantalla.
  const layerTotals = useMemo(() => computeLayerTotals(txs, capaOverrides), [txs, capaOverrides])

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
          <Logo size={45} withBackground={false} />
          <div className={styles.headerActions}>
            <HeaderPill onSignOut={handleSignOut} onHelp={handleHelp}/>
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

            <div className="flex items-center justify-center gap-2" style={{ flex: 1, minWidth: 0 }}>
              <h1
                className={styles.monthTitle}
                aria-live="polite"
              >
                {label}
              </h1>

              {justUpdated && (
                <span
                  aria-live="polite"
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--green)',
                    background: 'var(--green-soft)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '3px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Nueva transacción
                </span>
              )}
            </div>

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
          gastos={layerTotals.fijo + layerTotals.variable}
          mes={month}
          refreshSignal={contextVersion}
        />

        {isCurrent && <WeeklyAllowanceCard refreshSignal={contextVersion} />}

        <div data-testid="tour-budget" className={styles.planWrap}>
          <CategoriesCard
            mes={month}
            transactions={txs}
            capaOverrides={capaOverrides}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onBudgetsChange={setBudgets}
            onSaved={bumpContext}
            onSavingsTransaction={() => { loadMonth(month); bumpContext() }}
            savingsRefreshSignal={savingsRefresh}
            onManageCategories={() => setCatManagerOpen(true)}
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
            capaOverrides={capaOverrides}
            onCategoryCreated={loadCapas}
            onManageCategories={() => setCatManagerOpen(true)}
            onCategoryChange={() => { loadMonth(month); bumpContext() }}
            onTransactionDeleted={() => { loadMonth(month); bumpContext(); bumpSavingsRefresh() }}
            onAdd={() => setManualOpen(v => !v)}
            addOpen={manualOpen}
            budgets={budgets}
          />
        </div>
      </main>

      {catManagerOpen && (
        <CategoryManager
          capaOverrides={capaOverrides}
          transactions={txs}
          onClose={() => setCatManagerOpen(false)}
          onChanged={({ transaccionesCambiaron }) => {
            loadCapas()
            bumpContext()
            if (transaccionesCambiaron) loadMonth(month)
          }}
        />
      )}

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
