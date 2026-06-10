'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search, Check, RefreshCw, X } from 'lucide-react'
import {
  type Transaction,
  type Categoria,
  type Banco,
  CATEGORIA_LABELS,
  formatCOP,
  isIngreso,
} from '@/lib/types'

// MEJORA ③: rows simplificados (divulgación progresiva)
//   Antes: [CAT chip][BANCO chip] · hora  +  id_auditoria debajo del monto
//   Después: [CAT chip] · banco (texto plano) · hora  |  id al tocar
//
// MEJORA ④: chips colapsados (sin carrusel)
//   Antes: scroll horizontal con 16 chips
//   Después: 3 chips fijos + badge de filtro activo + bottom sheet de categorías

// ── Theme maps (igual que el original) ───────────────────────────────────────

const CATEGORIA_THEME: Record<Categoria, { color: string; bg: string }> = {
  TRANSPORTE:     { color: 'var(--blue)',        bg: 'var(--blue-soft)' },
  SALIDAS:        { color: 'var(--red)',         bg: 'var(--red-soft)' },
  HOGAR:          { color: 'var(--green)',       bg: 'var(--green-soft)' },
  SALUD:          { color: 'var(--green)',       bg: 'var(--green-soft)' },
  SUSCRIPCIONES:  { color: 'var(--purple)',      bg: 'var(--purple-soft)' },
  COMPRAS_ONLINE: { color: 'var(--yellow)',      bg: 'var(--yellow-soft)' },
  INVERSION:      { color: 'var(--purple)',      bg: 'var(--purple-soft)' },
  DONACIONES:     { color: 'var(--blue)',        bg: 'var(--blue-soft)' },
  EDUCACION:      { color: 'var(--yellow)',      bg: 'var(--yellow-soft)' },
  REEMBOLSABLE:   { color: 'var(--yellow)',      bg: 'var(--yellow-soft)' },
  TRANSFERENCIA:  { color: 'var(--blue)',        bg: 'var(--blue-soft)' },
  INGRESO:        { color: 'var(--green)',       bg: 'var(--green-soft)' },
  OTRO:           { color: 'var(--text-muted)', bg: 'var(--surface-2)' },
}

const BANCO_LABEL: Record<Banco, { label: string; color: string }> = {
  RAPPICARD: { label: 'RappiCard', color: 'var(--yellow)' },
  RAPPIPAY:  { label: 'RappiPay',  color: 'var(--blue)' },
  OTRO:      { label: 'Otro',      color: 'var(--text-muted)' },
}

type FilterKey = Categoria | 'TODOS' | 'BANCO:RAPPICARD' | 'BANCO:RAPPIPAY'

// Solo las categorías (para el bottom sheet)
const CAT_FILTER_KEYS: Array<{ key: FilterKey; label: string }> = [
  { key: 'SALIDAS',        label: 'Salidas' },
  { key: 'TRANSPORTE',     label: 'Transporte' },
  { key: 'HOGAR',          label: 'Hogar' },
  { key: 'SALUD',          label: 'Salud' },
  { key: 'SUSCRIPCIONES',  label: 'Suscripciones' },
  { key: 'COMPRAS_ONLINE', label: 'Online' },
  { key: 'TRANSFERENCIA',  label: 'Transferencias' },
  { key: 'INVERSION',      label: 'Inversión' },
  { key: 'INGRESO',        label: 'Ingresos' },
  { key: 'DONACIONES',     label: 'Donaciones' },
  { key: 'EDUCACION',      label: 'Educación' },
  { key: 'REEMBOLSABLE',   label: 'Reembolsable' },
  { key: 'OTRO',           label: 'Otro' },
]

// ── Helpers (iguales al original) ─────────────────────────────────────────────

const LOWERCASE_ES = new Set(['y','e','o','de','del','la','el','los','las','en','a','con','por','al'])

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
  switch (t.tipo) {
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

// ── CategorySheet ─────────────────────────────────────────────────────────────

function CategorySheet({
  active,
  onChange,
  onClose,
}: {
  active: FilterKey
  onChange: (key: FilterKey) => void
  onClose: () => void
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
        style={{
          background: 'var(--surface-2)',
          borderTop: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          padding: '12px 20px 40px',
        }}
      >
        <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--border)' }} />
        <p className="font-semibold mb-3" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
          Categorías
        </p>
        <div className="flex flex-wrap gap-2">
          {CAT_FILTER_KEYS.map(f => {
            const on    = active === f.key
            const theme = CATEGORIA_THEME[f.key as Categoria] ?? CATEGORIA_THEME['OTRO']
            return (
              <button
                key={f.key}
                onClick={() => onChange(f.key)}
                className="rounded-full"
                style={{
                  padding: '7px 14px',
                  background: on ? theme.color : theme.bg,
                  color: on ? 'var(--bg)' : theme.color,
                  border: 'none',
                  fontSize: 'var(--text-xs)',
                  fontWeight: on ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── FilterChips (colapsados) ──────────────────────────────────────────────────

function FilterChips({
  active,
  onChange,
}: {
  active: FilterKey
  onChange: (key: FilterKey) => void
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const isCatActive    = active !== 'TODOS' && !active.startsWith('BANCO:')
  const activeCatInfo  = isCatActive ? CAT_FILTER_KEYS.find(f => f.key === active) : null
  const activeCatTheme = isCatActive ? (CATEGORIA_THEME[active as Categoria] ?? CATEGORIA_THEME['OTRO']) : null

  const FIXED: Array<{ key: FilterKey; label: string; bg: string; color: string; border: string }> = [
    {
      key: 'TODOS',
      label: 'Todos',
      bg:     active === 'TODOS' ? 'var(--text)' : 'transparent',
      color:  active === 'TODOS' ? 'var(--bg)'   : 'var(--text-muted)',
      border: active === 'TODOS' ? 'none'         : '1px solid var(--border)',
    },
    {
      key: 'BANCO:RAPPICARD',
      label: 'RappiCard',
      bg:     active === 'BANCO:RAPPICARD' ? 'var(--yellow)'      : 'var(--yellow-soft)',
      color:  active === 'BANCO:RAPPICARD' ? 'var(--bg)'          : 'var(--yellow)',
      border: 'none',
    },
    {
      key: 'BANCO:RAPPIPAY',
      label: 'RappiPay',
      bg:     active === 'BANCO:RAPPIPAY' ? 'var(--blue)'         : 'var(--blue-soft)',
      color:  active === 'BANCO:RAPPIPAY' ? 'var(--bg)'           : 'var(--blue)',
      border: 'none',
    },
  ]

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* 3 chips fijos */}
        {FIXED.map(f => (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className="flex-shrink-0 rounded-full"
            style={{
              padding: '5px 12px',
              background: f.bg,
              color: f.color,
              border: f.border,
              fontSize: 'var(--text-xs)',
              fontWeight: active === f.key ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}

        {/* Badge de categoría activa (con × para limpiar) */}
        {activeCatInfo && activeCatTheme && (
          <button
            onClick={() => onChange('TODOS')}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-full"
            style={{
              padding: '5px 8px 5px 12px',
              background: activeCatTheme.color,
              color: 'var(--bg)',
              border: 'none',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {activeCatInfo.label}
            <span
              className="flex items-center justify-center rounded-full"
              style={{ width: 14, height: 14, background: 'rgba(0,0,0,0.2)', fontSize: 10 }}
            >
              ×
            </span>
          </button>
        )}

        <div className="flex-1" />

        {/* Botón para abrir el sheet de categorías */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex-shrink-0 flex items-center gap-1 rounded-full"
          style={{
            padding: '5px 10px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {!isCatActive && (
            <span style={{ color: 'var(--text-subtle)' }}>{CAT_FILTER_KEYS.length}</span>
          )}
          <span>▾</span>
        </button>
      </div>

      {sheetOpen && (
        <CategorySheet
          active={active}
          onChange={key => { onChange(key); setSheetOpen(false) }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}

// ── CategoryPicker bottom sheet ────────────────────────────────────────────

function CategoryPicker({ current, onSelect, onClose }: {
  current: Categoria
  onSelect: (c: Categoria) => void
  onClose: () => void
}) {
  const cats = Object.keys(CATEGORIA_LABELS) as Categoria[]
  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', padding: '16px 20px 40px' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>Cambiar categoría</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {cats.map(cat => {
            const on    = cat === current
            const theme = CATEGORIA_THEME[cat] ?? CATEGORIA_THEME['OTRO']
            return (
              <button key={cat} onClick={() => onSelect(cat)} className="rounded-full" style={{ padding: '7px 14px', background: on ? theme.color : theme.bg, color: on ? 'var(--bg)' : theme.color, border: 'none', fontSize: 'var(--text-xs)', fontWeight: on ? 600 : 400, cursor: 'pointer' }}>
                {CATEGORIA_LABELS[cat]}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── TransactionRow ─────────────────────────────────────────────────────────

function TransactionRow({ t, pendingCat, onCategoryClick }: {
  t: Transaction
  pendingCat?: Categoria
  onCategoryClick: () => void
}) {
  const [expanded] = useState(false)
  const income    = isIngreso(t.tipo)
  const displayCat = pendingCat ?? t.categoria
  const theme     = CATEGORIA_THEME[displayCat] ?? CATEGORIA_THEME['OTRO']
  const banco     = efectivoBanco(t)
  const chip      = BANCO_LABEL[banco]
  const time      = format(new Date(t.fecha), 'HH:mm', { locale: es })
  const isDirty   = pendingCat !== undefined

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: '12px 0 12px 14px',
        borderBottom: '1px solid var(--border-soft)',
        borderLeft: `2.5px solid ${theme.color}55`,
        marginLeft: -16,
      }}
    >
      <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: theme.color }} />

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
          {getDisplayName(t)}
        </p>
        <div className="flex items-center gap-1" style={{ marginTop: 3 }}>
          {/* Chip de categoría — toca para cambiar */}
          <button
            onClick={onCategoryClick}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: isDirty ? 'var(--yellow)' : theme.color }}>
              {CATEGORIA_LABELS[displayCat]}
            </span>
            {isDirty && <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--yellow)', display: 'inline-block' }} />}
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>·</span>
          <span style={{ fontSize: 10, color: chip.color }}>{chip.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>·</span>
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{time}</span>
        </div>
        {expanded && t.id_auditoria && (
          <p className="font-mono mt-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
            {t.id_auditoria}
          </p>
        )}
      </div>

      <div className="flex-shrink-0">
        <p className="font-semibold tabular-nums" style={{ fontSize: 'var(--text-sm)', color: income ? 'var(--green)' : 'var(--text)' }}>
          {income ? '+' : '-'}{formatCOP(t.monto)}
        </p>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  transactions: Transaction[]
  activeFilter: string
  onFilterChange: (key: string) => void
  onCategoriesUpdated?: () => void
}

export default function TransactionsList({ transactions, activeFilter, onFilterChange, onCategoriesUpdated }: Props) {
  const [search,          setSearch]          = useState('')
  const [pendingCats,     setPendingCats]      = useState<Record<string, Categoria>>({})
  const [pickerTxId,      setPickerTxId]       = useState<string | null>(null)
  const [savingCats,      setSavingCats]       = useState(false)
  const [savedCatsOk,     setSavedCatsOk]      = useState(false)
  const activeFilterKey = activeFilter as FilterKey

  const hasPendingCats = Object.keys(pendingCats).length > 0

  const saveCategoryChanges = async () => {
    setSavingCats(true)
    try {
      const changes = Object.entries(pendingCats).map(([id, categoria]) => ({ id, categoria }))
      const res = await fetch('/api/transactions/categorize', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      })
      if (!res.ok) throw new Error('Error')
      setPendingCats({})
      setSavedCatsOk(true)
      onCategoriesUpdated?.()
      setTimeout(() => setSavedCatsOk(false), 2500)
    } finally {
      setSavingCats(false)
    }
  }

  const pickerTx = pickerTxId ? transactions.find(t => t.id === pickerTxId) : null

  const filtered = useMemo(() => transactions.filter(t => {
    let matchesCategory: boolean
    if (activeFilter === 'TODOS') {
      matchesCategory = true
    } else if (activeFilter === 'BANCO:RAPPICARD') {
      matchesCategory = efectivoBanco(t) === 'RAPPICARD'
    } else if (activeFilter === 'BANCO:RAPPIPAY') {
      matchesCategory = efectivoBanco(t) === 'RAPPIPAY'
    } else {
      matchesCategory = t.categoria === activeFilter || (activeFilter === 'INGRESO' && isIngreso(t.tipo))
    }
    const q = search.toLowerCase()
    const matchesSearch = !search
      || t.comercio?.toLowerCase().includes(q)
      || t.descripcion?.toLowerCase().includes(q)
      || CATEGORIA_LABELS[t.categoria].toLowerCase().includes(q)
    return matchesCategory && matchesSearch
  }), [transactions, activeFilter, search])

  const totalGastos   = useMemo(() => filtered.filter(t => !isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0), [filtered])
  const totalIngresos = useMemo(() => filtered.filter(t =>  isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0), [filtered])
  const groups        = useMemo(() => groupByDate(filtered), [filtered])

  return (
    <>
    <div
      className="rounded-[var(--radius-lg)]"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        overflow: 'hidden',
      }}
    >
      {/* Buscador */}
      <div className="px-4 pt-4 pb-3">
        <div
          className="flex items-center gap-2 rounded-[var(--radius-md)]"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            padding: '9px 13px',
          }}
        >
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar comercio..."
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {/* Chips */}
      <div className="px-4 pb-3" style={{ borderBottom: (hasPendingCats || savingCats || savedCatsOk) ? 'none' : '1px solid var(--border-soft)' }}>
        <FilterChips active={activeFilterKey} onChange={key => onFilterChange(key)} />
      </div>

      {/* Botón guardar categorías — fila separada, solo visible cuando hay cambios */}
      {(hasPendingCats || savingCats || savedCatsOk) && (
        <div className="px-4 pb-3" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <button
            onClick={saveCategoryChanges}
            disabled={savingCats || !hasPendingCats}
            className="w-full flex items-center justify-center gap-2"
            style={{
              padding: '7px 0',
              background: savedCatsOk ? 'var(--green-soft)' : 'var(--surface-2)',
              border: `1px solid ${savedCatsOk ? 'var(--green)' : 'var(--yellow)'}`,
              borderRadius: 'var(--radius-sm)',
              color: savedCatsOk ? 'var(--green)' : 'var(--yellow)',
              fontSize: 'var(--text-xs)', fontWeight: 500,
              cursor: savingCats || !hasPendingCats ? 'default' : 'pointer',
            }}
          >
            {savingCats  ? <><RefreshCw size={10} className="animate-spin" /> Guardando categorías…</> :
             savedCatsOk ? <><Check size={10} /> Categorías guardadas</> :
                           `Guardar ${Object.keys(pendingCats).length} cambio${Object.keys(pendingCats).length !== 1 ? 's' : ''} de categoría`}
          </button>
        </div>
      )}

      {/* Resumen */}
      {filtered.length > 0 && (
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-2)' }}
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
              <span className="font-semibold tabular-nums" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
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
                  <TransactionRow
                    t={t}
                    pendingCat={pendingCats[t.id]}
                    onCategoryClick={() => setPickerTxId(t.id)}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {filtered.length > 0 && <div className="pb-2" />}
    </div>

    {/* CategoryPicker fuera del contenedor backdrop-filter para que position:fixed funcione */}
    {pickerTx && (
      <CategoryPicker
        current={pendingCats[pickerTx.id] ?? pickerTx.categoria}
        onSelect={cat => {
          if (cat === pickerTx.categoria) {
            const next = { ...pendingCats }
            delete next[pickerTx.id]
            setPendingCats(next)
          } else {
            setPendingCats(prev => ({ ...prev, [pickerTx.id]: cat }))
          }
          setPickerTxId(null)
        }}
        onClose={() => setPickerTxId(null)}
      />
    )}
    </>
  )
}
