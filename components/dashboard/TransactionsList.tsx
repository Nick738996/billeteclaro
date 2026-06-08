'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  type Transaction,
  type Categoria,
  type Banco,
  CATEGORIA_LABELS,
  CATEGORIA_COLORS,
  formatCOP,
  isIngreso,
} from '@/lib/types'

const BANCO_CHIP: Record<Banco, { label: string; bg: string; color: string }> = {
  RAPPICARD: { label: 'Crédito', bg: '#fff7ed', color: '#ea580c' },
  RAPPIPAY:  { label: 'Débito',  bg: '#f0fdfa', color: '#0d9488' },
  OTRO:      { label: 'Otro',    bg: '#f8fafc', color: '#64748b' },
}

interface Props {
  transactions: Transaction[]
}

const CATEGORY_FILTERS: Array<{ key: Categoria | 'TODOS'; label: string }> = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'SALIDAS', label: 'Salidas' },
  { key: 'TRANSPORTE', label: 'Transporte' },
  { key: 'HOGAR', label: 'Hogar' },
  { key: 'SALUD', label: 'Salud' },
  { key: 'SUSCRIPCIONES', label: 'Suscripciones' },
  { key: 'COMPRAS_ONLINE', label: 'Online' },
  { key: 'INVERSION', label: 'Inversión' },
  { key: 'INGRESO', label: 'Ingresos' },
]

function TransactionRow({ t }: { t: Transaction }) {
  const income = isIngreso(t.tipo)
  const date = new Date(t.fecha)
  const color = CATEGORIA_COLORS[t.categoria]

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      {/* Category color dot */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}18` }}
      >
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">
          {t.comercio ?? t.descripcion ?? 'Transacción'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            className="text-xs px-1.5 py-0.5 rounded-md font-medium"
            style={{ color, backgroundColor: `${color}18` }}
          >
            {CATEGORIA_LABELS[t.categoria]}
          </span>
          {(() => {
            const chip = BANCO_CHIP[t.banco]
            return (
              <span
                className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                style={{ color: chip.color, backgroundColor: chip.bg }}
              >
                {chip.label}
              </span>
            )
          })()}
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-400">
            {format(date, "d MMM · HH:mm", { locale: es })}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="flex-shrink-0 text-right">
        <p
          className={`text-sm font-semibold tabular-nums ${
            income ? 'text-brand-600' : 'text-slate-800'
          }`}
        >
          {income ? '+' : '-'}{formatCOP(t.monto)}
        </p>
        {t.id_auditoria && (
          <p className="text-xs text-slate-300 mt-0.5">{t.id_auditoria}</p>
        )}
      </div>
    </div>
  )
}

export default function TransactionsList({ transactions }: Props) {
  const [activeFilter, setActiveFilter] = useState<Categoria | 'TODOS'>('TODOS')
  const [search, setSearch] = useState('')

  const filtered = transactions.filter((t) => {
    const matchesCategory =
      activeFilter === 'TODOS' ||
      t.categoria === activeFilter ||
      (activeFilter === 'INGRESO' && isIngreso(t.tipo))
    const searchLower = search.toLowerCase()
    const matchesSearch =
      !search ||
      t.comercio?.toLowerCase().includes(searchLower) ||
      t.descripcion?.toLowerCase().includes(searchLower) ||
      CATEGORIA_LABELS[t.categoria].toLowerCase().includes(searchLower)
    return matchesCategory && matchesSearch
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
      {/* Search */}
      <div className="p-4 border-b border-slate-100">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar transacciones..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-slate-50">
        {CATEGORY_FILTERS.map((f) => {
          const isActive = activeFilter === f.key
          const catColor = f.key !== 'TODOS' ? CATEGORIA_COLORS[f.key as Categoria] : null
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key as Categoria | 'TODOS')}
              className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
              style={catColor ? {
                backgroundColor: isActive ? catColor : `${catColor}22`,
                color: isActive ? '#fff' : catColor,
              } : {
                backgroundColor: isActive ? '#10b981' : '#f1f5f9',
                color: isActive ? '#fff' : '#475569',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Transaction rows */}
      <div className="px-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            {search ? 'Sin resultados para tu búsqueda' : 'Sin transacciones este mes'}
          </p>
        ) : (
          filtered.map((t) => <TransactionRow key={t.id} t={t} />)
        )}
      </div>

      {filtered.length > 0 && (
        <div className="px-4 pb-4 pt-2 text-center">
          <p className="text-xs text-slate-400">
            {filtered.length} transacción{filtered.length !== 1 ? 'es' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
