'use client'

// Página temporal de preview visual — NO forma parte de la app.
// Renderiza los bloques del Dashboard con datos mock para revisar el
// rediseño sin necesitar login real. Borrar antes de mergear.

import { useEffect, useState } from 'react'
import MonthHero from '@/components/dashboard/MonthHero'
import CategoriesCard from '@/components/dashboard/CategoriesCard'
import HeaderPill from '@/components/dashboard/HeaderPill'
import type { Transaction, Categoria } from '@/lib/types'

let seq = 0
function mkTx(categoria: Categoria, monto: number, tipo: Transaction['tipo'] = 'COMPRA'): Transaction {
  seq += 1
  return {
    id: `mock-${seq}`,
    user_id: 'mock',
    gmail_message_id: `mock-${seq}`,
    fecha: '2026-07-15T12:00:00Z',
    monto,
    comercio: catLabelMock(categoria),
    descripcion: null,
    banco: 'RAPPICARD',
    tipo,
    categoria,
    subcategoria: null,
    id_auditoria: `0715-${String(seq).padStart(2, '0')}`,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
    raw_snippet: null,
    procesado: true,
    mes_contable: '2026-07',
    es_sueldo: false,
    created_at: '2026-07-15T12:00:00Z',
    contraparte_id: null,
  }
}
function catLabelMock(c: string) { return c }

const TXS: Transaction[] = [
  mkTx('HOGAR', 1_450_000),          // excede su presupuesto (1.2M) -> rojo
  mkTx('TRANSPORTE', 260_000),       // cerca del límite (300K, 86%) -> amarillo
  mkTx('SALIDAS', 180_000),          // dentro del límite (400K, 45%) -> verde
  mkTx('SUSCRIPCIONES', 100_000),    // exactamente en el límite -> check
  mkTx('DEUDA', 520_000),            // sin dato de límite en este mock -> sin presupuesto
  mkTx('COMPRAS_ONLINE', 90_000),    // sin presupuesto
  mkTx('INGRESO', 5_000_000, 'INGRESO'),
]

const MOCK_BUDGETS = {
  HOGAR: { monto: 1_200_000, subcategorias: [] },
  TRANSPORTE: { monto: 300_000, subcategorias: [] },
  SALIDAS: { monto: 400_000, subcategorias: [] },
  SUSCRIPCIONES: { monto: 100_000, subcategorias: [] },
}

function buildStats(txs: Transaction[]) {
  const gastosTxs = txs.filter(t => t.tipo !== 'INGRESO')
  const gastos = gastosTxs.reduce((s, t) => s + t.monto, 0)
  const ingresos = txs.filter(t => t.tipo === 'INGRESO').reduce((s, t) => s + t.monto, 0)
  const porCategoria = gastosTxs.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoria] = (acc[t.categoria] ?? 0) + t.monto
    return acc
  }, {})
  return { gastos, ingresos, porCategoria }
}

export default function UIPreviewPage() {
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [activeFilter, setActiveFilter] = useState('TODOS')

  useEffect(() => {
    const orig = window.fetch.bind(window)
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/budgets')) {
        return new Response(JSON.stringify({ budgets: MOCK_BUDGETS }), { status: 200 })
      }
      return orig(input, init)
    }) as typeof window.fetch
    return () => { window.fetch = orig }
  }, [])

  const stats = buildStats(TXS)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <HeaderPill onSignOut={() => {}} onHelp={() => {}} />
        </div>

        <MonthHero
          gastos={stats.gastos}
          ingresos={stats.ingresos}
          ahorros={0}
          transacciones={TXS.length}
          mes="2026-07"
          budgetTotal={Object.values(budgets).reduce((s, v) => s + (v || 0), 0)}
        />

        <CategoriesCard
          mes="2026-07"
          transactions={TXS}
          gastosPorCategoria={stats.porCategoria}
          ingresos={stats.ingresos}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onBudgetsChange={setBudgets}
          onSaved={() => {}}
        />
      </div>
    </div>
  )
}
