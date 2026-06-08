import { startOfMonth, endOfMonth, parseISO } from 'date-fns'
import DashboardClient from '@/app/dashboard/DashboardClient'
import type { Transaction } from '@/lib/types'

// Fechas fijas para que el demo sea estable independiente del día actual
const JUN = (d: number, h = 12) => new Date(`2026-06-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00`).toISOString()
const MAY = (d: number, h = 12) => new Date(`2026-05-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00`).toISOString()

const DEMO_TRANSACTIONS: Transaction[] = [
  // ── JUNIO 2026 ──────────────────────────────────────────────
  {
    id: 'j1', user_id: 'demo', gmail_message_id: 'mj1',
    fecha: JUN(1, 8), monto: 5800000, comercio: 'Empresa XYZ S.A.S', descripcion: 'Nómina junio',
    banco: 'RAPPIPAY', tipo: 'INGRESO', categoria: 'INGRESO', subcategoria: null,
    id_auditoria: '0601-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: JUN(1),
  },
  {
    id: 'j2', user_id: 'demo', gmail_message_id: 'mj2',
    fecha: JUN(2, 14), monto: 230000, comercio: 'Éxito Chapinero', descripcion: 'Mercado — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'HOGAR', subcategoria: null,
    id_auditoria: '0602-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: JUN(2),
  },
  {
    id: 'j3', user_id: 'demo', gmail_message_id: 'mj3',
    fecha: JUN(3, 10), monto: 62000, comercio: 'Netflix', descripcion: 'Netflix — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SUSCRIPCIONES', subcategoria: null,
    id_auditoria: '0603-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: JUN(3),
  },
  {
    id: 'j4', user_id: 'demo', gmail_message_id: 'mj4',
    fecha: JUN(4, 20), monto: 45000, comercio: 'Rappi Food', descripcion: 'Rappi Food — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SALIDAS', subcategoria: null,
    id_auditoria: '0604-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: JUN(4),
  },
  {
    id: 'j5', user_id: 'demo', gmail_message_id: 'mj5',
    fecha: JUN(5, 9), monto: 89000, comercio: 'Claro', descripcion: 'Claro — RappiPay',
    banco: 'RAPPIPAY', tipo: 'PAGO_SERVICIO', categoria: 'HOGAR', subcategoria: null,
    id_auditoria: '0605-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: JUN(5),
  },
  {
    id: 'j6', user_id: 'demo', gmail_message_id: 'mj6',
    fecha: JUN(5, 18), monto: 18500, comercio: 'Uber', descripcion: 'Uber — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'TRANSPORTE', subcategoria: null,
    id_auditoria: '0605-02', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: JUN(5),
  },
  {
    id: 'j7', user_id: 'demo', gmail_message_id: 'mj7',
    fecha: JUN(6, 13), monto: 350000, comercio: 'Fondo RappiPay', descripcion: 'Bóveda RappiPay',
    banco: 'RAPPIPAY', tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'INVERSION', subcategoria: null,
    id_auditoria: '0606-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: JUN(6),
  },
  {
    id: 'j8', user_id: 'demo', gmail_message_id: 'mj8',
    fecha: JUN(7, 11), monto: 85000, comercio: 'Droguería Colsubsidio', descripcion: 'Farmacia — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SALUD', subcategoria: null,
    id_auditoria: '0607-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: JUN(7),
  },

  // ── MAYO 2026 ────────────────────────────────────────────────
  {
    id: 'm1', user_id: 'demo', gmail_message_id: 'mm1',
    fecha: MAY(1, 8), monto: 5800000, comercio: 'Empresa XYZ S.A.S', descripcion: 'Nómina mayo',
    banco: 'RAPPIPAY', tipo: 'INGRESO', categoria: 'INGRESO', subcategoria: null,
    id_auditoria: '0501-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: MAY(1),
  },
  {
    id: 'm2', user_id: 'demo', gmail_message_id: 'mm2',
    fecha: MAY(5, 14), monto: 190000, comercio: 'Platzi', descripcion: 'Platzi Membresía — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'EDUCACION', subcategoria: null,
    id_auditoria: '0505-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: MAY(5),
  },
  {
    id: 'm3', user_id: 'demo', gmail_message_id: 'mm3',
    fecha: MAY(8, 10), monto: 12900, comercio: 'Spotify', descripcion: 'Spotify Premium — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SUSCRIPCIONES', subcategoria: null,
    id_auditoria: '0508-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: MAY(8),
  },
  {
    id: 'm4', user_id: 'demo', gmail_message_id: 'mm4',
    fecha: MAY(12, 19), monto: 35000, comercio: 'Café Amor Perfecto', descripcion: 'Café — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SALIDAS', subcategoria: null,
    id_auditoria: '0512-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: MAY(12),
  },
  {
    id: 'm5', user_id: 'demo', gmail_message_id: 'mm5',
    fecha: MAY(15, 9), monto: 95000, comercio: 'Claro', descripcion: 'Claro — RappiPay',
    banco: 'RAPPIPAY', tipo: 'PAGO_SERVICIO', categoria: 'HOGAR', subcategoria: null,
    id_auditoria: '0515-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: MAY(15),
  },
  {
    id: 'm6', user_id: 'demo', gmail_message_id: 'mm6',
    fecha: MAY(18, 17), monto: 22000, comercio: 'InDriver', descripcion: 'InDriver — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'TRANSPORTE', subcategoria: null,
    id_auditoria: '0518-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: MAY(18),
  },
  {
    id: 'm7', user_id: 'demo', gmail_message_id: 'mm7',
    fecha: MAY(22, 13), monto: 300000, comercio: 'Fondo RappiPay', descripcion: 'Bóveda RappiPay',
    banco: 'RAPPIPAY', tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'INVERSION', subcategoria: null,
    id_auditoria: '0522-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: MAY(22),
  },
  {
    id: 'm8', user_id: 'demo', gmail_message_id: 'mm8',
    fecha: MAY(28, 20), monto: 68000, comercio: 'Rappi Food', descripcion: 'Rappi Food — RappiCard',
    banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SALIDAS', subcategoria: null,
    id_auditoria: '0528-01', moneda: 'COP', monto_usd: null, flags: [],
    raw_snippet: null, procesado: true, created_at: MAY(28),
  },
]

function filterByMonth(txs: Transaction[], yearMonth: string): Transaction[] {
  const ref = parseISO(`${yearMonth}-01`)
  const start = startOfMonth(ref)
  const end = endOfMonth(ref)
  return txs
    .filter(t => { const f = new Date(t.fecha); return f >= start && f <= end })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
}

export default function DemoPage() {
  const currentMonth = '2026-06'
  const initTxs = filterByMonth(DEMO_TRANSACTIONS, currentMonth)

  return (
    <>
      <div className="bg-amber-400 text-amber-900 text-center text-xs font-semibold py-2 px-4">
        MODO DEMO — datos de ejemplo · Para usar con tu cuenta real ve a{' '}
        <a href="/" className="underline">billeteclaro.app</a>
      </div>

      <DashboardClient
        user={{ name: 'Demo Usuario' }}
        transactions={initTxs}
        monthLabel="junio 2026"
        currentMonth={currentMonth}
        prevMonth="2026-05"
        nextMonth="2026-07"
        isCurrentMonth={false}
        allTransactions={DEMO_TRANSACTIONS}
      />
    </>
  )
}
