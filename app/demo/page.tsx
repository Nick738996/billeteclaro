import DashboardClient from '@/app/dashboard/DashboardClient'
import type { Transaction, MonthlyStats } from '@/lib/types'

const DEMO_TRANSACTIONS: Transaction[] = [
  {
    id: '1', user_id: 'demo', gmail_message_id: 'm1',
    fecha: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    monto: 45000, comercio: 'Rappi Food', descripcion: 'Rappi Food — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SALIDAS', subcategoria: null,
    id_auditoria: '0606-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '2', user_id: 'demo', gmail_message_id: 'm2',
    fecha: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    monto: 5800000, comercio: 'Empresa XYZ S.A.S', descripcion: 'Nómina junio',
    banco: 'BANCOLOMBIA', tipo: 'INGRESO', categoria: 'INGRESO', subcategoria: null,
    id_auditoria: '0606-02', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '3', user_id: 'demo', gmail_message_id: 'm3',
    fecha: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    monto: 89000, comercio: 'Claro', descripcion: 'Claro — Bancolombia',
    banco: 'BANCOLOMBIA', tipo: 'PAGO_SERVICIO', categoria: 'HOGAR', subcategoria: null,
    id_auditoria: '0605-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '4', user_id: 'demo', gmail_message_id: 'm4',
    fecha: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    monto: 18500, comercio: 'Uber', descripcion: 'Uber — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'TRANSPORTE', subcategoria: null,
    id_auditoria: '0605-02', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '5', user_id: 'demo', gmail_message_id: 'm5',
    fecha: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    monto: 62000, comercio: 'Netflix', descripcion: 'Netflix — Nu',
    banco: 'NU', tipo: 'COMPRA', categoria: 'SUSCRIPCIONES', subcategoria: null,
    id_auditoria: '0604-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '6', user_id: 'demo', gmail_message_id: 'm6',
    fecha: new Date(Date.now() - 52 * 60 * 60 * 1000).toISOString(),
    monto: 230000, comercio: 'Éxito Chapinero', descripcion: 'Mercado — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'HOGAR', subcategoria: null,
    id_auditoria: '0604-02', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '7', user_id: 'demo', gmail_message_id: 'm7',
    fecha: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    monto: 35000, comercio: 'Café Amor Perfecto', descripcion: 'Café — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SALIDAS', subcategoria: null,
    id_auditoria: '0603-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '8', user_id: 'demo', gmail_message_id: 'm8',
    fecha: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),
    monto: 350000, comercio: 'Fondo Nubank', descripcion: 'Bóveda Nu',
    banco: 'NU', tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'INVERSION', subcategoria: null,
    id_auditoria: '0602-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '9', user_id: 'demo', gmail_message_id: 'm9',
    fecha: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
    monto: 12900, comercio: 'Spotify', descripcion: 'Spotify Premium — Nu',
    banco: 'NU', tipo: 'COMPRA', categoria: 'SUSCRIPCIONES', subcategoria: null,
    id_auditoria: '0602-02', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '10', user_id: 'demo', gmail_message_id: 'm10',
    fecha: new Date(Date.now() - 110 * 60 * 60 * 1000).toISOString(),
    monto: 85000, comercio: 'Droguería Colsubsidio', descripcion: 'Farmacia — Nu',
    banco: 'NU', tipo: 'COMPRA', categoria: 'SALUD', subcategoria: null,
    id_auditoria: '0602-03', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '11', user_id: 'demo', gmail_message_id: 'm11',
    fecha: new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString(),
    monto: 22000, comercio: 'InDriver', descripcion: 'InDriver — Nequi',
    banco: 'NEQUI', tipo: 'COMPRA', categoria: 'TRANSPORTE', subcategoria: null,
    id_auditoria: '0601-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
  {
    id: '12', user_id: 'demo', gmail_message_id: 'm12',
    fecha: new Date(Date.now() - 130 * 60 * 60 * 1000).toISOString(),
    monto: 190000, comercio: 'Platzi', descripcion: 'Platzi Membresía — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'EDUCACION', subcategoria: null,
    id_auditoria: '0601-02', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: new Date().toISOString(),
  },
]

function buildStats(txs: Transaction[]): MonthlyStats {
  const gastos = txs.filter(t => t.tipo !== 'INGRESO' && t.tipo !== 'TRANSFERENCIA_RECIBIDA').reduce((s, t) => s + t.monto, 0)
  const ingresos = txs.filter(t => t.tipo === 'INGRESO' || t.tipo === 'TRANSFERENCIA_RECIBIDA').reduce((s, t) => s + t.monto, 0)
  const porCategoria = txs
    .filter(t => t.tipo !== 'INGRESO' && t.tipo !== 'TRANSFERENCIA_RECIBIDA')
    .reduce((acc, t) => ({ ...acc, [t.categoria]: (acc[t.categoria as keyof typeof acc] ?? 0) + t.monto }), {} as any)

  return { gastos, ingresos, balance: ingresos - gastos, transacciones: txs.length, porCategoria }
}

export default function DemoPage() {
  const stats = buildStats(DEMO_TRANSACTIONS)

  return (
    <>
      {/* Demo banner */}
      <div className="bg-amber-400 text-amber-900 text-center text-xs font-semibold py-2 px-4">
        MODO DEMO — datos de ejemplo · Para usar con tu cuenta real ve a{' '}
        <a href="/" className="underline">billeteclaro.app</a>
      </div>

      <DashboardClient
        user={{ name: 'Demo Usuario' }}
        transactions={DEMO_TRANSACTIONS}
        stats={stats}
        monthLabel="junio 2026"
        currentMonth="2026-06"
        prevMonth="2026-05"
        nextMonth="2026-07"
        isCurrentMonth={true}
      />
    </>
  )
}
