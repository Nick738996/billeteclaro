'use client'

import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search, RefreshCw, X, Trash2, Plus, Check } from 'lucide-react'
import {
  type Transaction,
  type Categoria,
  type Banco,
  CATEGORIA_LABELS,
  formatCOP,
  formatCOPCompact,
  isIngreso,
  isGasto,
} from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

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
  AHORROS:        { color: 'var(--blue)',        bg: 'var(--blue-soft)' },
  PRESTAMO:       { color: 'var(--purple)',      bg: 'var(--purple-soft)' },
  DEUDA:          { color: 'var(--red)',         bg: 'var(--red-soft)' },
  DONACIONES:     { color: 'var(--blue)',        bg: 'var(--blue-soft)' },
  EDUCACION:      { color: 'var(--yellow)',      bg: 'var(--yellow-soft)' },
  REEMBOLSABLE:   { color: 'var(--yellow)',      bg: 'var(--yellow-soft)' },
  TRANSFERENCIA:  { color: 'var(--blue)',        bg: 'var(--blue-soft)' },
  INGRESO:        { color: 'var(--green)',       bg: 'var(--green-soft)' },
  OTRO:           { color: 'var(--text-muted)', bg: 'var(--surface-2)' },
}

const BANCO_LABEL: Record<Banco, { label: string; color: string }> = {
  RAPPICARD:   { label: 'RappiCard',   color: 'var(--yellow)' },
  RAPPIPAY:    { label: 'RappiPay',    color: 'var(--blue)' },
  BANCOLOMBIA: { label: 'Bancolombia', color: 'var(--green)' },
  OTRO:        { label: 'Otro',        color: 'var(--text-muted)' },
}

type FilterKey = Categoria | 'TODOS' | 'BANCO:RAPPICARD' | 'BANCO:RAPPIPAY' | 'BANCO:BANCOLOMBIA'

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
  { key: 'AHORROS',        label: 'Ahorros' },
  { key: 'PRESTAMO',       label: 'Préstamo' },
  { key: 'DEUDA',          label: 'Deuda' },
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
  const now       = new Date()
  const todayKey  = format(now, 'yyyy-MM-dd')
  const yestKey   = format(new Date(now.getTime() - 86_400_000), 'yyyy-MM-dd')

  const groups: Record<string, { dateLabel: string; items: Transaction[] }> = {}
  for (const t of txs) {
    const key = format(new Date(t.fecha), 'yyyy-MM-dd')
    const label =
      key === todayKey ? 'Hoy'
      : key === yestKey ? 'Ayer'
      : format(new Date(t.fecha), "d 'de' MMMM", { locale: es })
    groups[key] ??= { dateLabel: label, items: [] }
    groups[key].items.push(t)
  }
  return Object.values(groups)
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
        style={{ background: 'var(--overlay)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtrar por categoría"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
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

  const INACTIVE = { bg: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }

  const FIXED: Array<{ key: FilterKey; label: string; bg: string; color: string; border: string; testId: string }> = [
    {
      key:    'TODOS',
      label:  'Todos',
      bg:     active === 'TODOS' ? 'var(--text)' : INACTIVE.bg,
      color:  active === 'TODOS' ? 'var(--bg)'   : INACTIVE.color,
      border: active === 'TODOS' ? 'none'         : INACTIVE.border,
      testId: TEST_IDS.DASHBOARD_FILTER_TODOS,
    },
    {
      key:    'BANCO:RAPPICARD',
      label:  'RappiCard',
      bg:     active === 'BANCO:RAPPICARD' ? 'var(--yellow)' : INACTIVE.bg,
      color:  active === 'BANCO:RAPPICARD' ? 'var(--bg)'     : INACTIVE.color,
      border: active === 'BANCO:RAPPICARD' ? 'none'           : INACTIVE.border,
      testId: TEST_IDS.DASHBOARD_FILTER_RAPPICARD,
    },
    {
      key:    'BANCO:RAPPIPAY',
      label:  'RappiPay',
      bg:     active === 'BANCO:RAPPIPAY' ? 'var(--blue)' : INACTIVE.bg,
      color:  active === 'BANCO:RAPPIPAY' ? 'var(--bg)'   : INACTIVE.color,
      border: active === 'BANCO:RAPPIPAY' ? 'none'         : INACTIVE.border,
      testId: TEST_IDS.DASHBOARD_FILTER_RAPPIPAY,
    },
    {
      key:    'BANCO:BANCOLOMBIA',
      label:  'Bancolombia',
      bg:     active === 'BANCO:BANCOLOMBIA' ? 'var(--green)' : INACTIVE.bg,
      color:  active === 'BANCO:BANCOLOMBIA' ? 'var(--bg)'    : INACTIVE.color,
      border: active === 'BANCO:BANCOLOMBIA' ? 'none'          : INACTIVE.border,
      testId: 'filter-bancolombia',
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
            data-testid={f.testId}
            aria-pressed={active === f.key}
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
            padding: '5px 12px',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 400,
            cursor: 'pointer',
          }}
        >
          Categoría
          <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
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
  if (typeof document === 'undefined') return null
  const cats = Object.keys(CATEGORIA_LABELS) as Categoria[]
  return createPortal(
    <>
      <div className="fixed inset-0 z-50" style={{ background: 'var(--overlay)' }} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cambiar categoría"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        style={{
          background: 'var(--surface-2)',
          borderTop: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          padding: '16px 20px',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>Cambiar categoría</p>
          <button onClick={onClose} aria-label="Cerrar selector de categoría" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
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
    </>,
    document.body
  )
}

// ── TransactionRow ─────────────────────────────────────────────────────────

type DeletePhase = 'idle' | 'confirming' | 'deleting'

function TransactionRow({ t, pendingCat, onCategoryClick, onDelete }: {
  t: Transaction
  pendingCat?: Categoria
  onCategoryClick: () => void
  onDelete: () => void
}) {
  const [deletePhase, setDeletePhase] = useState<DeletePhase>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const income     = isIngreso(t.tipo)
  const displayCat = pendingCat ?? t.categoria
  const theme      = CATEGORIA_THEME[displayCat] ?? CATEGORIA_THEME['OTRO']
  const banco      = efectivoBanco(t)
  const chip       = BANCO_LABEL[banco]
  const time       = format(new Date(t.fecha), 'HH:mm', { locale: es })
  const isDirty    = !!pendingCat

  function startConfirm() {
    setDeletePhase('confirming')
    timerRef.current = setTimeout(() => setDeletePhase('idle'), 2000)
  }

  function cancelConfirm() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setDeletePhase('idle')
  }

  async function confirmDelete() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setDeletePhase('deleting')
    onDelete()
  }

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: '10px 0',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
          {getDisplayName(t)}
        </p>
        <div className="flex items-center gap-1" style={{ marginTop: 3 }}>
          <button
            onClick={onCategoryClick}
            aria-label={`Cambiar categoría: ${CATEGORIA_LABELS[displayCat]}`}
            style={{
              background: isDirty ? 'var(--yellow-soft)' : 'transparent',
              border: `1px solid ${isDirty ? 'var(--yellow)' : 'transparent'}`,
              borderRadius: 'var(--radius-badge)',
              padding: '1px 4px 1px 2px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isDirty ? 'var(--yellow)' : theme.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: isDirty ? 'var(--yellow)' : theme.color }}>
              {CATEGORIA_LABELS[displayCat]}
            </span>
            <span style={{ fontSize: 9, color: isDirty ? 'var(--yellow)' : theme.color, opacity: isDirty ? 0.7 : 0.45, lineHeight: 1 }}>✎</span>
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>·</span>
          <span style={{ fontSize: 10, color: chip.color }}>{chip.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>·</span>
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{time}</span>
        </div>
      </div>

      {/* Área derecha: monto + papelera en idle/deleting, controles de confirmación en confirming */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {deletePhase !== 'confirming' && (
          <p className="font-semibold tabular-nums" style={{ fontSize: 'var(--text-sm)', color: income ? 'var(--green)' : 'var(--text)' }}>
            {income ? '+' : '-'}{formatCOP(t.monto)}
          </p>
        )}

        {deletePhase === 'idle' && (
          <button
            onClick={startConfirm}
            aria-label={`Eliminar transacción: ${getDisplayName(t)}`}
            className="delete-btn"
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex', opacity: 0.3 }}
          >
            <Trash2 size={12} />
          </button>
        )}
        {deletePhase === 'confirming' && (
          <>
            <button
              onClick={cancelConfirm}
              aria-label="Cancelar eliminación"
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
            >
              <X size={13} />
            </button>
            <button
              onClick={confirmDelete}
              aria-label={`Confirmar eliminación de: ${getDisplayName(t)}`}
              style={{
                background: 'var(--red-soft)',
                border: '1px solid var(--red)',
                borderRadius: 'var(--radius-badge)',
                padding: '4px 10px',
                cursor: 'pointer',
                color: 'var(--red)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              Eliminar
            </button>
          </>
        )}
        {deletePhase === 'deleting' && (
          <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  transactions: Transaction[]
  activeFilter: string
  onFilterChange: (key: string) => void
  onCategoryChange?: () => void
  onTransactionDeleted?: () => void
  onAdd?: () => void
}

export default function TransactionsList({ transactions, activeFilter, onFilterChange, onCategoryChange, onTransactionDeleted, onAdd }: Props) {
  const [search,      setSearch]      = useState('')
  const [pendingCats, setPendingCats] = useState<Record<string, Categoria>>({})
  const [isSaving,    setIsSaving]    = useState(false)
  const [savedOk,     setSavedOk]     = useState(false)
  const [pickerTxId,  setPickerTxId]  = useState<string | null>(null)
  const [deletedIds,  setDeletedIds]  = useState<Set<string>>(new Set())
  const activeFilterKey = activeFilter as FilterKey
  const pendingCount    = Object.keys(pendingCats).length

  const handleDelete = async (t: Transaction) => {
    setDeletedIds(prev => new Set(prev).add(t.id))
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onTransactionDeleted?.()
    } catch {
      setDeletedIds(prev => { const next = new Set(prev); next.delete(t.id); return next })
    }
  }

  const selectCategory = (txId: string, newCat: Categoria) => {
    const original = transactions.find(t => t.id === txId)?.categoria
    setPendingCats(prev => {
      const next = { ...prev }
      if (newCat === original) delete next[txId]
      else next[txId] = newCat
      return next
    })
  }

  const saveCategories = async () => {
    if (!pendingCount || isSaving) return
    setIsSaving(true)
    try {
      const results = await Promise.all(
        Object.entries(pendingCats).map(([id, categoria]) =>
          fetch('/api/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, categoria }),
          })
        )
      )
      const failed = results.find(r => !r.ok)
      if (failed) {
        const body = await failed.json().catch(() => ({}))
        throw new Error(`${failed.status}: ${body.error ?? 'error desconocido'}`)
      }
      setPendingCats({})
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 1800)
      onCategoryChange?.()
    } finally {
      setIsSaving(false)
    }
  }

  const pickerTx = pickerTxId ? transactions.find(t => t.id === pickerTxId) : null

  const filtered = useMemo(() => transactions.filter(t => !deletedIds.has(t.id)).filter(t => {
    let matchesCategory: boolean
    if (activeFilter === 'TODOS') {
      matchesCategory = true
    } else if (activeFilter === 'BANCO:RAPPICARD') {
      matchesCategory = efectivoBanco(t) === 'RAPPICARD'
    } else if (activeFilter === 'BANCO:RAPPIPAY') {
      matchesCategory = efectivoBanco(t) === 'RAPPIPAY'
    } else if (activeFilter === 'BANCO:BANCOLOMBIA') {
      matchesCategory = efectivoBanco(t) === 'BANCOLOMBIA'
    } else {
      matchesCategory = t.categoria === activeFilter || (activeFilter === 'INGRESO' && isIngreso(t.tipo))
    }
    const q = search.toLowerCase()
    const matchesSearch = !search
      || t.comercio?.toLowerCase().includes(q)
      || t.descripcion?.toLowerCase().includes(q)
      || CATEGORIA_LABELS[t.categoria].toLowerCase().includes(q)
    return matchesCategory && matchesSearch
  }), [transactions, activeFilter, search, deletedIds])

  const totalGastos   = useMemo(() => filtered.filter(t => isGasto(t.tipo, t.categoria) || t.categoria === 'AHORROS' || t.categoria === 'PRESTAMO' || (t.categoria === 'TRANSFERENCIA' && !isIngreso(t.tipo))).reduce((s, t) => s + t.monto, 0), [filtered])
  const totalIngresos = useMemo(() => filtered.filter(t =>  isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0), [filtered])
  const groups        = useMemo(() => groupByDate(filtered), [filtered])

  return (
    <>
    <div className="card">
      {/* Header dentro del card */}
      <div
        className="flex items-center justify-between"
        style={{ padding: '14px 16px 0' }}
      >
        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Transacciones
        </p>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)', fontWeight: 500, padding: '2px 0',
            }}
          >
            <Plus size={11} />
            Agregar
          </button>
        )}
      </div>

      {/* Buscador */}
      <div className="px-4 pt-3 pb-3">
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
            placeholder="Buscar..."
            aria-label="Buscar transacciones"
            data-testid={TEST_IDS.DASHBOARD_SEARCH_INPUT}
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {/* Chips */}
      <div className="px-4 pb-3" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <FilterChips active={activeFilterKey} onChange={key => onFilterChange(key)} />
      </div>


      {/* Lista agrupada por fecha */}
      <div className="px-4" data-testid={TEST_IDS.DASHBOARD_TRANSACTIONS_LIST} role="list" aria-label="Lista de transacciones">
        {filtered.length === 0 ? (
          <p className="text-center py-8" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {search ? 'Sin resultados para tu búsqueda' : 'Sin transacciones este mes'}
          </p>
        ) : (
          groups.map(({ dateLabel, items }) => (
            <div key={dateLabel}>
              <div
                className="flex items-center gap-2 py-2"
              >
                <p
                  className="font-medium uppercase tracking-wider"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}
                >
                  {dateLabel}
                </p>
                <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 400 }}>
                  {items.length}
                </span>
              </div>
              {items.map((t, i) => (
                <div key={t.id} role="listitem" data-testid={TEST_IDS.DASHBOARD_TRANSACTION_ITEM} style={i === items.length - 1 ? { borderBottom: 'none' } : {}}>
                  <TransactionRow
                    t={t}
                    pendingCat={pendingCats[t.id]}
                    onCategoryClick={() => setPickerTxId(t.id)}
                    onDelete={() => handleDelete(t)}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {filtered.length > 0 && (
        <div
          className="flex items-center justify-between"
          style={{ padding: '10px 20px 12px', borderTop: '1px solid var(--border-soft)' }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>
            {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-3">
            {totalIngresos > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--green)', fontWeight: 500 }}>
                +{formatCOPCompact(totalIngresos)}
              </span>
            )}
            {totalGastos > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
                -{formatCOPCompact(totalGastos)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>

    {/* Barra flotante de cambios pendientes */}
    {pendingCount > 0 && typeof document !== 'undefined' && createPortal(
      <div
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 60, width: 'calc(100% - 32px)', maxWidth: 480,
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill)',
            padding: '10px 10px 10px 18px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
            {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPendingCats({})}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                fontWeight: 500, padding: '6px 10px',
              }}
            >
              Descartar
            </button>
            <button
              onClick={saveCategories}
              disabled={isSaving}
              className="flex items-center gap-1.5"
              style={{
                background: savedOk ? 'var(--green)' : 'var(--text)',
                border: 'none',
                borderRadius: 'var(--radius-pill)',
                padding: '7px 16px',
                color: 'var(--bg)',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                cursor: isSaving ? 'default' : 'pointer',
              }}
            >
              {isSaving
                ? <><RefreshCw size={11} className="animate-spin" /> Guardando…</>
                : savedOk
                ? <><Check size={11} /> Guardado</>
                : 'Guardar'
              }
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {pickerTx && (
      <CategoryPicker
        current={pendingCats[pickerTx.id] ?? pickerTx.categoria}
        onSelect={cat => {
          selectCategory(pickerTx.id, cat)
          setPickerTxId(null)
        }}
        onClose={() => setPickerTxId(null)}
      />
    )}
    </>
  )
}
