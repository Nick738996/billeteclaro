'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search } from 'lucide-react'
import {
  type Transaction,
  type Categoria,
  type Banco,
  type TipoTransaccion,
  CATEGORIA_LABELS,
  formatCOP,
  isIngreso,
} from '@/lib/types'

// Colores semánticos por categoría usando CSS variables del tema
const CATEGORIA_THEME: Record<Categoria, { color: string; bg: string }> = {
  TRANSPORTE:     { color: 'var(--blue)',   bg: 'var(--blue-soft)' },
  SALIDAS:        { color: 'var(--red)',    bg: 'var(--red-soft)' },
  HOGAR:          { color: 'var(--green)',  bg: 'var(--green-soft)' },
  SALUD:          { color: 'var(--green)',  bg: 'var(--green-soft)' },
  SUSCRIPCIONES:  { color: 'var(--purple)', bg: 'var(--purple-soft)' },
  COMPRAS_ONLINE: { color: 'var(--yellow)', bg: 'var(--yellow-soft)' },
  INVERSION:      { color: 'var(--purple)', bg: 'var(--purple-soft)' },
  DONACIONES:     { color: 'var(--blue)',   bg: 'var(--blue-soft)' },
  EDUCACION:      { color: 'var(--yellow)', bg: 'var(--yellow-soft)' },
  REEMBOLSABLE:   { color: 'var(--yellow)', bg: 'var(--yellow-soft)' },
  TRANSFERENCIA:  { color: 'var(--blue)',   bg: 'var(--blue-soft)' },
  INGRESO:        { color: 'var(--green)',  bg: 'var(--green-soft)' },
  OTRO:           { color: 'var(--text-muted)', bg: 'var(--surface-2)' },
}

const BANCO_CHIP: Record<Banco, { label: string; color: string; bg: string }> = {
  RAPPICARD: { label: 'Crédito', color: 'var(--yellow)', bg: 'var(--yellow-soft)' },
  RAPPIPAY:  { label: 'Débito',  color: 'var(--blue)',   bg: 'var(--blue-soft)' },
  OTRO:      { label: 'Otro',    color: 'var(--text-muted)', bg: 'var(--surface-2)' },
}

type FilterKey = Categoria | 'TODOS' | 'BANCO:RAPPICARD' | 'BANCO:RAPPIPAY'

const CATEGORY_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'TODOS',           label: 'Todos' },
  { key: 'BANCO:RAPPICARD', label: '💳 Crédito' },
  { key: 'BANCO:RAPPIPAY',  label: '🏦 Débito' },
  { key: 'SALIDAS',         label: 'Salidas' },
  { key: 'TRANSPORTE',      label: 'Transporte' },
  { key: 'HOGAR',           label: 'Hogar' },
  { key: 'SALUD',           label: 'Salud' },
  { key: 'SUSCRIPCIONES',   label: 'Suscripciones' },
  { key: 'COMPRAS_ONLINE',  label: 'Online' },
  { key: 'TRANSFERENCIA',   label: 'Transferencias' },
  { key: 'INVERSION',       label: 'Inversión' },
  { key: 'INGRESO',         label: 'Ingresos' },
  { key: 'DONACIONES',      label: 'Donaciones' },
  { key: 'EDUCACION',       label: 'Educación' },
  { key: 'REEMBOLSABLE',    label: 'Reembolsable' },
  { key: 'OTRO',            label: 'Otro' },
]

const LOWERCASE_ES = new Set(['y', 'e', 'o', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'a', 'con', 'por', 'al'])

function toTitleCase(str: string): string {
  if (!str) return str
  if (str.startsWith('@') || str.includes('@')) return str
  if (str !== str.toUpperCase() && str !== str.toLowerCase()) return str
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => i > 0 && LOWERCASE_ES.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getDisplayName(t: Transaction): string {
  const comercio = t.comercio ? toTitleCase(t.comercio) : null
  switch (t.tipo as TipoTransaccion) {
    case 'TRANSFERENCIA_ENVIADA':  return comercio ? `Transferencia a ${comercio}` : 'Transferencia enviada'
    case 'TRANSFERENCIA_RECIBIDA': return comercio ? `Transferencia de ${comercio}` : 'Transferencia recibida'
    case 'ABONO_DEUDA':            return comercio ? `Pago a ${comercio}` : 'Pago tarjeta'
    case 'PAGO_SERVICIO':          return comercio ? `Pago ${comercio}` : 'Pago servicio'
    default:                       return comercio ?? t.descripcion ?? 'Transacción'
  }
}

function efectivoBanco(t: Transaction): Banco {
  return t.tipo === 'ABONO_DEUDA' ? 'RAPPIPAY' : t.banco
}

function groupByDate(txs: Transaction[]): Array<{ dateLabel: string; items: Transaction[] }> {
  const groups: Record<string, Transaction[]> = {}
  for (const t of txs) {
    const label = format(new Date(t.fecha), "d 'de' MMMM", { locale: es })
    groups[label] = groups[label] ?? []
    groups[label].push(t)
  }
  return Object.entries(groups).map(([dateLabel, items]) => ({ dateLabel, items }))
}

function TransactionRow({ t }: { t: Transaction }) {
  const income = isIngreso(t.tipo)
  const theme = CATEGORIA_THEME[t.categoria]
  const banco = efectivoBanco(t)
  const chip = BANCO_CHIP[banco]

  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: '1px solid var(--border-soft)' }}
    >
      {/* Dot de categoría */}
      <div
        className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0"
        style={{ background: theme.bg }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: theme.color }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="font-medium truncate"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}
        >
          {getDisplayName(t)}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {/* Badge categoría */}
          <span
            className="font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={{
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.04em',
              color: theme.color,
              background: theme.bg,
            }}
          >
            {CATEGORIA_LABELS[t.categoria]}
          </span>
          {/* Badge banco */}
          <span
            className="font-medium px-1.5 py-0.5 rounded-full"
            style={{
              fontSize: 'var(--text-xs)',
              color: chip.color,
              background: chip.bg,
            }}
          >
            {chip.label}
          </span>
          <span style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)' }}>·</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            {format(new Date(t.fecha), 'HH:mm', { locale: es })}
          </span>
        </div>
      </div>

      {/* Monto */}
      <div className="flex-shrink-0 text-right">
        <p
          className="font-semibold tabular-nums"
          style={{
            fontSize: 'var(--text-sm)',
            color: income ? 'var(--green)' : 'var(--text)',
          }}
        >
          {income ? '+' : '-'}{formatCOP(t.monto)}
        </p>
        {t.id_auditoria && (
          <p
            className="font-mono mt-0.5"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}
          >
            {t.id_auditoria}
          </p>
        )}
      </div>
    </div>
  )
}

interface Props {
  transactions: Transaction[]
}

export default function TransactionsList({ transactions }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('TODOS')
  const [search, setSearch] = useState('')

  const filtered = transactions.filter((t) => {
    let matchesCategory: boolean
    if (activeFilter === 'TODOS') {
      matchesCategory = true
    } else if (activeFilter === 'BANCO:RAPPICARD') {
      matchesCategory = efectivoBanco(t) === 'RAPPICARD'
    } else if (activeFilter === 'BANCO:RAPPIPAY') {
      matchesCategory = efectivoBanco(t) === 'RAPPIPAY'
    } else {
      matchesCategory =
        t.categoria === activeFilter ||
        (activeFilter === 'INGRESO' && isIngreso(t.tipo))
    }
    const q = search.toLowerCase()
    const matchesSearch =
      !search ||
      t.comercio?.toLowerCase().includes(q) ||
      t.descripcion?.toLowerCase().includes(q) ||
      CATEGORIA_LABELS[t.categoria].toLowerCase().includes(q)
    return matchesCategory && matchesSearch
  })

  const totalGastos = filtered.filter(t => !isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0)
  const totalIngresos = filtered.filter(t => isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0)
  const groups = groupByDate(filtered)

  return (
    <div
      className="rounded-[var(--radius-lg)]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Buscador */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar comercio..."
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {/* Carrusel de filtros */}
      <div className="relative" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div
          className="flex gap-2 px-4 py-3 scrollbar-hide"
          style={{
            overflowX: 'scroll',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}
        >
          {CATEGORY_FILTERS.map((f) => {
            const isActive = activeFilter === f.key
            let color: string
            let bg: string

            if (f.key === 'TODOS') {
              color = isActive ? 'var(--bg)' : 'var(--text-muted)'
              bg = isActive ? 'var(--text)' : 'var(--surface-2)'
            } else if (f.key === 'BANCO:RAPPICARD') {
              color = isActive ? 'var(--bg)' : 'var(--yellow)'
              bg = isActive ? 'var(--yellow)' : 'var(--yellow-soft)'
            } else if (f.key === 'BANCO:RAPPIPAY') {
              color = isActive ? 'var(--bg)' : 'var(--blue)'
              bg = isActive ? 'var(--blue)' : 'var(--blue-soft)'
            } else {
              const theme = CATEGORIA_THEME[f.key as Categoria]
              color = isActive ? 'var(--bg)' : theme.color
              bg = isActive ? theme.color : theme.bg
            }

            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className="flex-shrink-0 font-medium transition-colors"
                style={{
                  fontSize: 'var(--text-xs)',
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  color,
                  background: bg,
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
        <div
          className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none"
          style={{ background: 'linear-gradient(to right, transparent, var(--surface))' }}
        />
      </div>

      {/* Resumen del filtro */}
      {filtered.length > 0 && (
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{
            borderBottom: '1px solid var(--border-soft)',
            background: 'var(--surface-2)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {filtered.length} transacción{filtered.length !== 1 ? 'es' : ''}
          </span>
          <div className="flex items-center gap-3">
            {totalIngresos > 0 && (
              <span className="font-semibold tabular-nums" style={{ fontSize: 'var(--text-sm)', color: 'var(--green)' }}>
                +{formatCOP(totalIngresos)}
              </span>
            )}
            {totalGastos > 0 && (
              <span className="font-semibold tabular-nums" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                -{formatCOP(totalGastos)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Lista agrupada por fecha */}
      <div className="px-4">
        {filtered.length === 0 ? (
          <p className="text-center py-8" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {search ? 'Sin resultados para tu búsqueda' : 'Sin transacciones este mes'}
          </p>
        ) : (
          groups.map(({ dateLabel, items }) => (
            <div key={dateLabel}>
              <p
                className="py-2 font-medium uppercase tracking-wider"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}
              >
                {dateLabel}
              </p>
              {items.map((t, i) => (
                <div key={t.id} style={i === items.length - 1 ? { borderBottom: 'none' } : {}}>
                  <TransactionRow t={t} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {filtered.length > 0 && <div className="pb-2" />}
    </div>
  )
}
