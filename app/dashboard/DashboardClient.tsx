'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, addMonths, subMonths, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Transaction, Capa, BudgetSubcat } from '@/lib/types'
import { computeMonthSummary, gruposRecurrentes, pagosRecurrentesFueraDelPlan, type PlanBase, type PagoRecurrente } from '@/lib/services/monthSummary'
import { historialPlan } from '@/lib/services/planReality'
import { toColombiaDate } from '@/lib/utils/mesContable'
import { capasDelPlan, categoriasDelPlan, categoriasPorRegistrar } from '@/lib/services/planCategories'
import { TEST_IDS } from '@/lib/testIds'
import MonthSummaryCard from '@/components/dashboard/MonthSummaryCard'
import SpendingCard from '@/components/dashboard/SpendingCard'
import ReviewCard from '@/components/dashboard/ReviewCard'
import PlanEditor from '@/components/dashboard/PlanEditor'
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
  const [categoriasGuardadas, setCategoriasGuardadas] = useState<Record<string, Capa>>({})
  const [capasLoaded, setCapasLoaded] = useState(false)
  const loadCapas = useCallback(() => {
    fetch('/api/category-capas')
      .then(r => r.json())
      .then(d => { setCategoriasGuardadas(d.overrides ?? {}); setCapasLoaded(true) })
      .catch(() => setCategoriasGuardadas({}))
  }, [])
  useEffect(() => { loadCapas() }, [loadCapas])

  const monthRef = parseISO(`${month}-01`)
  const prevMonth = format(subMonths(monthRef, 1), 'yyyy-MM')
  const nextMonth = format(addMonths(monthRef, 1), 'yyyy-MM')

  // Plan del mes (ingreso, fijos, meta de ahorro)
  type Plan = PlanBase & { fijoItems?: BudgetSubcat[]; ahorroItems?: BudgetSubcat[]; imprevistosMonto?: number }
  const [plan, setPlan] = useState<Plan | null>(null)
  const [editingPlan, setEditingPlan] = useState(false)
  const loadPlan = useCallback((m: string) => {
    fetch(`/api/monthly-plan?mes=${m}`)
      .then(r => r.json())
      .then(d => setPlan(d.plan ?? null))
      .catch(() => setPlan(null))
  }, [])
  useEffect(() => { loadPlan(month) }, [loadPlan, month])

  // Presupuestos por categoría (modelo anterior) — solo los usan el asesor IA
  // y la sección "Presupuestadas" del selector de categoría.
  useEffect(() => {
    fetch(`/api/budgets?mes=${month}`)
      .then(r => r.json())
      .then(d => setBudgets(Object.fromEntries(Object.entries(d.budgets ?? {}).map(([k, v]) => [k, (v as { monto: number }).monto]))))
      .catch(() => setBudgets({}))
  }, [month])

  // Últimos 3 meses, para detectar pagos que se repiten y no están en el plan
  const [prevTxs, setPrevTxs] = useState<Transaction[]>([])
  useEffect(() => {
    const meses = [1, 2, 3].map(i => format(subMonths(parseISO(`${month}-01`), i), 'yyyy-MM'))
    supabase
      .from('transactions')
      .select('id, fecha, monto, tipo, categoria, capa_override, subcategoria, mes_contable, comercio, contraparte_id')
      .in('mes_contable', meses)
      .then(({ data }) => setPrevTxs((data ?? []) as Transaction[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  // Todo lo que muestran las tarjetas sale de este resumen: una sola regla
  // para qué es cada movimiento, recalculada desde cero en cada cambio.
  const hoy = toColombiaDate(new Date().toISOString())
  // Lo que se repite mes a mes (para no tomar un pago recurrente como
  // imprevisto) y tu mes normal de los meses anteriores (para el plan)
  // Qué es fijo lo decide solo el plan del mes: los ítems de su desglose
  // (ver capasDelPlan). Las demás categorías predeterminadas son día a día.
  const capasPlan = useMemo(() => capasDelPlan(plan), [plan])
  const clavesRecurrentes = useMemo(
    () => new Set(gruposRecurrentes([...prevTxs, ...txs], capasPlan).keys()),
    [prevTxs, txs, capasPlan]
  )
  const historial = useMemo(() => historialPlan(prevTxs, capasPlan, plan?.fijoItems ?? []), [prevTxs, capasPlan, plan])
  const summary = useMemo(
    () => computeMonthSummary(txs, capasPlan, plan, month, hoy, clavesRecurrentes),
    [txs, capasPlan, plan, month, hoy, clavesRecurrentes]
  )
  const hasPlan = !!plan && plan.ingresoNetoMensual > 0

  const guardarPlan = useCallback(async (m: string, p: Plan) => {
    const res = await fetch('/api/monthly-plan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes: m, ...p, fijoItems: p.fijoItems ?? [], ahorroItems: p.ahorroItems ?? [] }),
    })
    if (!res.ok) throw new Error('No se pudo guardar el plan')
    loadPlan(m)
    bumpContext()
  }, [loadPlan, bumpContext])

  // Pagos que se repiten cada mes y no están en el plan → "Agregar al plan"
  const recurrentes = useMemo(
    () => hasPlan ? pagosRecurrentesFueraDelPlan(prevTxs, capasPlan, plan?.fijoItems ?? []) : [],
    [hasPlan, prevTxs, capasPlan, plan]
  )
  const agregarAlPlan = useCallback(async (r: PagoRecurrente) => {
    if (!plan) return
    await guardarPlan(month, {
      ...plan,
      fijoItems: [...(plan.fijoItems ?? []), { nombre: r.nombre, monto: r.monto }],
      fijoTotalMonto: plan.fijoTotalMonto + r.monto,
    })
  }, [plan, month, guardarPlan])

  // Mes sin plan: ofrecer el del mes anterior con un toque
  const [planAnterior, setPlanAnterior] = useState<Plan | null>(null)
  useEffect(() => {
    setPlanAnterior(null)
    if (hasPlan) return
    fetch(`/api/monthly-plan?mes=${prevMonth}`)
      .then(r => r.json())
      .then(d => setPlanAnterior(d.plan && d.plan.ingresoNetoMensual > 0 ? d.plan : null))
      .catch(() => setPlanAnterior(null))
  }, [hasPlan, prevMonth])

  // Cada ítem del desglose del plan (Arriendo, Gym, Mercado…) es una categoría
  // elegible al clasificar movimientos. Las nuevas se registran con la capa de
  // su sección (Fijos → Fijo, Ahorro → Ahorro) para que cuenten donde deben.
  // Espera a tener las capas cargadas: sin eso pisaría una que el usuario ya
  // reclasificó a mano.
  const planCats = useMemo(() => categoriasDelPlan(plan), [plan])
  useEffect(() => {
    if (!capasLoaded) return
    const nuevas = categoriasPorRegistrar(planCats, categoriasGuardadas)
    if (nuevas.length === 0) return
    Promise.all(nuevas.map(c => fetch('/api/category-capas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria: c.categoria, capa: c.capa }),
    }))).then(() => loadCapas()).catch(() => {})
  }, [planCats, categoriasGuardadas, capasLoaded, loadCapas])

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


        {editingPlan ? (
          <PlanEditor
            mes={month}
            mesLabel={format(parseISO(`${month}-01`), 'MMMM', { locale: es })}
            plan={plan}
            historial={historial}
            recibidoMes={summary.recibido}
            onSaved={() => { loadPlan(month); bumpContext(); setEditingPlan(false) }}
            onClose={() => setEditingPlan(false)}
          />
        ) : (
          <MonthSummaryCard
            summary={summary}
            hasPlan={hasPlan}
            isCurrent={isCurrent}
            onEditPlan={() => setEditingPlan(true)}
            planAnterior={planAnterior ? {
              mesLabel: format(parseISO(`${prevMonth}-01`), 'MMMM', { locale: es }),
              usar: () => guardarPlan(month, planAnterior),
            } : null}
            onSavingsTransaction={() => { loadMonth(month); bumpContext() }}
            savingsRefreshSignal={savingsRefresh}
          />
        )}

        <ReviewCard items={summary.porRevisar} onChanged={() => { loadMonth(month); bumpContext() }} />

        <div data-testid="tour-budget">
          <SpendingCard
            summary={summary}
            onManageCategories={() => setCatManagerOpen(true)}
            recurrentes={recurrentes}
            onAddToPlan={agregarAlPlan}
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
            capaOverrides={capasPlan}
            categoriasPropias={Object.keys(categoriasGuardadas)}
            planCats={planCats.map(c => c.categoria)}
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
          categoriasPropias={Object.keys(categoriasGuardadas)}
          planCats={planCats.map(c => c.categoria)}
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
