'use client'

import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Locale } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'

// BilleteClaro es Colombia-only — la hora se muestra siempre en zona Bogotá
// (UTC-5, sin horario de verano) sin importar la zona horaria del dispositivo.
const BOGOTA_TZ = 'America/Bogota'
const format = (date: Date | number, fmt: string, opts?: { locale?: Locale }) =>
  formatInTimeZone(date, BOGOTA_TZ, fmt, opts)
import { Search, RefreshCw, X, Trash2, Plus, Check } from 'lucide-react'
import {
  type Transaction,
  type Categoria,
  type Banco,
  CATEGORIA_LABELS,
  catLabel,
  getCategoryColor,
  formatCOP,
  formatCOPCompact,
  isIngreso,
  isGasto,
} from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import styles from './TransactionsList.module.css'

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
  RAPPICARD:            { label: 'RappiCard',    color: 'var(--yellow)' },
  RAPPIPAY:             { label: 'RappiPay',     color: 'var(--blue)' },
  BANCOLOMBIA:          { label: 'Bancolombia',  color: 'var(--green)' },
  DAVIVIENDA:           { label: 'Davivienda',   color: 'var(--red)' },
  BBVA:                 { label: 'BBVA',         color: 'var(--blue)' },
  SCOTIABANK_COLPATRIA: { label: 'Scotiabank',   color: 'var(--red)' },
  BANCO_DE_BOGOTA:      { label: 'Banco Bogotá', color: 'var(--blue)' },
  NU:                   { label: 'Nu',           color: 'var(--purple)' },
  NEQUI:                { label: 'Nequi',        color: 'var(--purple)' },
  LULO_BANK:            { label: 'Lulo Bank',    color: 'var(--green)' },
  ITAU:                 { label: 'Itaú',         color: 'var(--yellow)' },
  FALABELLA:            { label: 'Falabella',    color: 'var(--red)' },
  OTRO:                 { label: 'Otro',         color: 'var(--text-muted)' },
}

type FilterKey = Categoria | 'TODOS' | `BANCO:${Banco}`

// ── Helpers (iguales al original) ─────────────────────────────────────────────

const LOWERCASE_ES = new Set(['y','e','o','de','del','la','el','los','las','en','a','con','por','al'])

function toTitleCase(str: string): string {
  if (!str) return str
  if (str.startsWith('@') || str.includes('@')) return str
  // Solo saltar si ya está en formato mixto (no TODO mayúsculas ni todo minúsculas)
  const up = str.toUpperCase()
  const lo = str.toLowerCase()
  if (str !== up && str !== lo) return str
  return lo
    .split(' ')
    .map((word, i) => i > 0 && LOWERCASE_ES.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getDisplayName(t: Transaction): string {
  const comercio = t.comercio ? toTitleCase(t.comercio) : null
  const desc = t.descripcion ? toTitleCase(t.descripcion) : null
  switch (t.tipo) {
    case 'INGRESO':
      return desc ?? (comercio ? `Ingreso de ${comercio}` : 'Ingreso')
    case 'TRANSFERENCIA_ENVIADA':
      return comercio ? `Transferencia a ${comercio}` : (desc ?? 'Transferencia enviada')
    case 'TRANSFERENCIA_RECIBIDA':
      return comercio ? `Transferencia de ${comercio}` : (desc ?? 'Transferencia recibida')
    case 'ABONO_DEUDA':
      return comercio ? `Pago a ${comercio}` : 'Pago tarjeta'
    case 'PAGO_SERVICIO':
      return comercio ? `Pago ${comercio}` : (desc ?? 'Pago servicio')
    default:
      return comercio ?? desc ?? 'Transacción'
  }
}

// Visual display: prefix arrow + clean name without verbose words
function getDisplayParts(t: Transaction): { prefix: string; name: string } {
  const comercio = t.comercio ? toTitleCase(t.comercio) : null
  const desc = t.descripcion ? toTitleCase(t.descripcion) : null
  switch (t.tipo) {
    case 'INGRESO':
      return { prefix: '↓', name: comercio ?? desc ?? 'Ingreso' }
    case 'TRANSFERENCIA_ENVIADA':
      return { prefix: '↑', name: comercio ?? desc ?? 'Transferencia' }
    case 'TRANSFERENCIA_RECIBIDA':
      return { prefix: '↓', name: comercio ?? desc ?? 'Transferencia' }
    case 'ABONO_DEUDA':
      return { prefix: '↑', name: comercio ? `Pago ${comercio}` : 'Pago tarjeta' }
    case 'PAGO_SERVICIO':
      return { prefix: '', name: comercio ?? desc ?? 'Pago servicio' }
    default:
      return { prefix: '', name: comercio ?? desc ?? 'Transacción' }
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

function CatFilterBtn({ cat, active, onChange }: { cat: string; active: FilterKey; onChange: (k: FilterKey) => void }) {
  const on    = active === cat
  const hex   = getCategoryColor(cat)
  const theme = CATEGORIA_THEME[cat as Categoria] ?? { color: hex, bg: hex + '22' }
  return (
    <button
      key={cat}
      onClick={() => onChange(cat as FilterKey)}
      className={`${styles.catBtn} ${on ? styles.catBtnOn : styles.catBtnOff}`}
      style={{ '--cat-clr': theme.color, '--cat-bg': theme.bg } as React.CSSProperties}
    >
      {catLabel(cat)}
    </button>
  )
}

function CategorySheet({
  active,
  onChange,
  onClose,
  budgetedCats,
  otherCats,
}: {
  active: FilterKey
  onChange: (key: FilterKey) => void
  onClose: () => void
  budgetedCats: string[]
  otherCats: string[]
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      <div
        className={styles.sheetOverlay}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtrar por categoría"
        className={styles.sheet}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      >
        <div className={styles.sheetHandle} />
        <p className={styles.sheetTitle}>
          Categorías
        </p>

        {budgetedCats.length > 0 && (
          <>
            <p className={styles.sectionLabel}>
              Presupuestadas
            </p>
            <div className={`${styles.chipGroup} ${styles.chipGroupMb}`}>
              {budgetedCats.map(cat => (
                <CatFilterBtn key={cat} cat={cat} active={active} onChange={onChange} />
              ))}
            </div>
          </>
        )}

        {otherCats.length > 0 && (
          <>
            {budgetedCats.length > 0 && (
              <p className={styles.sectionLabel}>
                Otras
              </p>
            )}
            <div className={styles.chipGroup}>
              {otherCats.map(cat => (
                <CatFilterBtn key={cat} cat={cat} active={active} onChange={onChange} />
              ))}
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  )
}

// ── FilterChips (colapsados) ──────────────────────────────────────────────────

function FilterChips({
  active,
  onChange,
  transactions,
  budgetedCats,
}: {
  active: FilterKey
  onChange: (key: FilterKey) => void
  transactions: Transaction[]
  budgetedCats: string[]
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const isCatActive    = active !== 'TODOS' && !active.startsWith('BANCO:')
  const activeCatLabel = isCatActive ? catLabel(active) : null
  const activeCatHex   = isCatActive ? getCategoryColor(active) : null

  // Bancos que realmente tienen transacciones este mes, en orden de frecuencia
  const availableBancos = useMemo(() => {
    const counts = new Map<Banco, number>()
    for (const t of transactions) {
      const b = efectivoBanco(t)
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([banco]) => banco)
  }, [transactions])

  // Categorías presentes en las transacciones que no están en el presupuesto
  const otherCats = useMemo(() => {
    const budgetSet = new Set<string>(budgetedCats)
    const seen = new Set<string>()
    const result: string[] = []
    for (const t of transactions) {
      if (!budgetSet.has(t.categoria) && !seen.has(t.categoria)) {
        seen.add(t.categoria)
        result.push(t.categoria)
      }
    }
    if (!budgetSet.has('OTRO') && !seen.has('OTRO')) result.push('OTRO')
    return result
  }, [transactions, budgetedCats])

  return (
    <>
      <div className={styles.filterRow}>
        {/* Todos */}
        <button
          key="TODOS"
          onClick={() => onChange('TODOS')}
          data-testid={TEST_IDS.DASHBOARD_FILTER_TODOS}
          aria-pressed={active === 'TODOS'}
          className={`${styles.filterBtn} ${active === 'TODOS' ? styles.filterBtnActive : styles.filterBtnInactive}`}
        >
          Todos
        </button>

        {/* Bancos + categoría activa — scroll horizontal */}
        <div className={`scroll-x-hide ${styles.filterScrollArea}`}>
          {availableBancos.map(banco => {
            const filterKey: FilterKey = `BANCO:${banco}`
            const isOn  = active === filterKey
            const info  = BANCO_LABEL[banco]
            const testId = banco === 'RAPPICARD'   ? TEST_IDS.DASHBOARD_FILTER_RAPPICARD
                         : banco === 'RAPPIPAY'    ? TEST_IDS.DASHBOARD_FILTER_RAPPIPAY
                         : banco === 'BANCOLOMBIA' ? 'filter-bancolombia'
                         : `filter-${banco.toLowerCase()}`
            return (
              <button
                key={filterKey}
                onClick={() => onChange(filterKey)}
                data-testid={testId}
                aria-pressed={isOn}
                className={`${styles.filterBtn} ${isOn ? styles.filterBtnActive : styles.filterBtnInactive}`}
              >
                {info.label}
              </button>
            )
          })}

          {/* Categoría activa — dot + nombre + × */}
          {activeCatLabel && activeCatHex && (
            <button
              onClick={() => onChange('TODOS')}
              className={styles.activeCatBtn}
            >
              <span
                className={styles.activeCatDot}
                style={{ '--dot-clr': activeCatHex } as React.CSSProperties}
              />
              <span className={styles.activeCatLabel}>{activeCatLabel}</span>
              <span className={styles.activeCatX}>×</span>
            </button>
          )}
        </div>

        {/* Filtrar por categoría */}
        <button
          onClick={() => setSheetOpen(true)}
          className={styles.openSheetBtn}
        >
          Categoría
          <span className={styles.openSheetArrow}>▾</span>
        </button>
      </div>

      {sheetOpen && (
        <CategorySheet
          active={active}
          onChange={key => { onChange(key); setSheetOpen(false) }}
          onClose={() => setSheetOpen(false)}
          budgetedCats={budgetedCats}
          otherCats={otherCats}
        />
      )}
    </>
  )
}

// ── CategoryPicker bottom sheet ────────────────────────────────────────────

function CatPickerBtn({ cat, current, onSelect }: { cat: string; current: string; onSelect: (c: Categoria) => void }) {
  const on    = cat === current
  const hex   = getCategoryColor(cat)
  const theme = CATEGORIA_THEME[cat as Categoria] ?? { color: hex, bg: hex + '22' }
  return (
    <button
      key={cat}
      onClick={() => onSelect(cat as Categoria)}
      className={`${styles.catBtn} ${on ? styles.catBtnOn : styles.catBtnOff}`}
      style={{ '--cat-clr': theme.color, '--cat-bg': theme.bg } as React.CSSProperties}
    >
      {catLabel(cat)}
    </button>
  )
}

function CategoryPicker({ current, onSelect, onClose, budgetedCats }: {
  current: Categoria
  onSelect: (c: Categoria) => void
  onClose: () => void
  budgetedCats: string[]
}) {
  if (typeof document === 'undefined') return null
  const allCats = Object.keys(CATEGORIA_LABELS) as Categoria[]
  const budgetSet = new Set<string>(budgetedCats)
  const otherCats = allCats.filter(c => !budgetSet.has(c))

  return createPortal(
    <>
      <div className={styles.pickerOverlay} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cambiar categoría"
        className={styles.pickerSheet}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      >
        <div className={styles.pickerHeader}>
          <p className={styles.pickerTitle}>Cambiar categoría</p>
          <button onClick={onClose} aria-label="Cerrar selector de categoría" className={styles.pickerCloseBtn}>
            <X size={16} />
          </button>
        </div>

        {budgetedCats.length > 0 && (
          <>
            <p className={styles.sectionLabel}>
              Presupuestadas
            </p>
            <div className={`${styles.chipGroup} ${styles.chipGroupMb}`}>
              {budgetedCats.map(cat => (
                <CatPickerBtn key={cat} cat={cat} current={current} onSelect={onSelect} />
              ))}
            </div>
            <p className={styles.sectionLabel}>
              Otras
            </p>
          </>
        )}
        <div className={styles.chipGroup}>
          {(budgetedCats.length > 0 ? otherCats : allCats).map(cat => (
            <CatPickerBtn key={cat} cat={cat} current={current} onSelect={onSelect} />
          ))}
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
  const catHex     = getCategoryColor(displayCat)
  const theme      = CATEGORIA_THEME[displayCat as Categoria] ?? { color: catHex, bg: catHex + '22' }
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
    <div className={`tx-row ${styles.row}`}>
      <div className={styles.rowLeft}>
        <p className={styles.rowName}>
          {getDisplayParts(t).name}
        </p>
        <div className={styles.rowMeta}>
          <button
            onClick={onCategoryClick}
            aria-label={`Cambiar categoría: ${catLabel(displayCat)}`}
            className={styles.catChipBtn}
          >
            <span
              className={styles.catDot}
              style={{ '--dot-clr': isDirty ? 'var(--yellow)' : theme.color } as React.CSSProperties}
            />
            <span className={`${styles.catChipLabel} ${isDirty ? styles.catChipLabelDirty : styles.catChipLabelNormal}`}>
              {catLabel(displayCat)}
            </span>
            <span className={`${styles.catChipArrow} ${isDirty ? styles.catChipArrowDirty : styles.catChipArrowNormal}`}>▾</span>
          </button>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaBank}>{chip.label}</span>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaTime}>{time}</span>
        </div>
      </div>

      {/* Área derecha: monto + papelera en idle/deleting, controles de confirmación en confirming */}
      <div className={styles.rowRight}>
        {deletePhase !== 'confirming' && (
          <p className={`${styles.amount} ${income ? styles.amountIncome : styles.amountExpense}`}>
            {income ? '+' : '-'}{formatCOP(t.monto)}
          </p>
        )}

        {deletePhase === 'idle' && (
          <button
            onClick={startConfirm}
            aria-label={`Eliminar transacción: ${getDisplayName(t)}`}
            className={`delete-btn ${styles.trashBtn}`}
          >
            <Trash2 size={13} />
          </button>
        )}
        {deletePhase === 'confirming' && (
          <>
            <button
              onClick={cancelConfirm}
              aria-label="Cancelar eliminación"
              className={styles.cancelBtn}
            >
              <X size={13} />
            </button>
            <button
              onClick={confirmDelete}
              aria-label={`Confirmar eliminación de: ${getDisplayName(t)}`}
              className={styles.confirmDeleteBtn}
            >
              Eliminar
            </button>
          </>
        )}
        {deletePhase === 'deleting' && (
          <RefreshCw size={12} className={`animate-spin ${styles.spinIcon}`} />
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
  budgets?: Record<string, number>
}

export default function TransactionsList({ transactions, activeFilter, onFilterChange, onCategoryChange, onTransactionDeleted, onAdd, budgets }: Props) {
  const [search,      setSearch]      = useState('')
  const [pendingCats, setPendingCats] = useState<Record<string, Categoria>>({})
  const [isSaving,    setIsSaving]    = useState(false)
  const [savedOk,     setSavedOk]     = useState(false)
  const [pickerTxId,  setPickerTxId]  = useState<string | null>(null)
  const [deletedIds,  setDeletedIds]  = useState<Set<string>>(new Set())
  const activeFilterKey = activeFilter as FilterKey
  const pendingCount    = Object.keys(pendingCats).length

  const budgetedCats = useMemo(() => Object.keys(budgets ?? {}), [budgets])

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
    } else if (activeFilter.startsWith('BANCO:')) {
      const banco = activeFilter.slice(6) as Banco
      matchesCategory = efectivoBanco(t) === banco
    } else {
      matchesCategory = t.categoria === activeFilter || (activeFilter === 'INGRESO' && isIngreso(t.tipo))
    }
    const q = search.toLowerCase()
    const matchesSearch = !search
      || t.comercio?.toLowerCase().includes(q)
      || t.descripcion?.toLowerCase().includes(q)
      || catLabel(t.categoria).toLowerCase().includes(q)
    return matchesCategory && matchesSearch
  }), [transactions, activeFilter, search, deletedIds])

  const totalGastos   = useMemo(() => filtered.filter(t => isGasto(t.tipo, t.categoria) || t.categoria === 'AHORROS' || t.categoria === 'PRESTAMO' || (t.categoria === 'TRANSFERENCIA' && !isIngreso(t.tipo))).reduce((s, t) => s + t.monto, 0), [filtered])
  const totalIngresos = useMemo(() => filtered.filter(t =>  isIngreso(t.tipo)).reduce((s, t) => s + t.monto, 0), [filtered])
  const groups        = useMemo(() => groupByDate(filtered), [filtered])

  return (
    <>
    <div className="card">
      {/* Header dentro del card */}
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>
          Transacciones
        </p>
        {onAdd && (
          <button
            onClick={onAdd}
            aria-label="Agregar transacción"
            className={styles.addBtn}
          >
            +
          </button>
        )}
      </div>

      {/* Buscador */}
      <div className={styles.searchWrap}>
        <div className={styles.searchBox}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            aria-label="Buscar transacciones"
            data-testid={TEST_IDS.DASHBOARD_SEARCH_INPUT}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Chips */}
      <div className={styles.chipsWrap}>
        <FilterChips active={activeFilterKey} onChange={key => onFilterChange(key)} transactions={transactions} budgetedCats={budgetedCats} />
      </div>


      {/* Lista agrupada por fecha */}
      <div className={styles.listWrap} data-testid={TEST_IDS.DASHBOARD_TRANSACTIONS_LIST} role="list" aria-label="Lista de transacciones">
        {filtered.length === 0 ? (
          <p className={styles.emptyMsg}>
            {search ? 'Sin resultados para tu búsqueda' : 'Sin transacciones este mes'}
          </p>
        ) : (
          groups.map(({ dateLabel, items }) => (
            <div key={dateLabel}>
              <div className={styles.dateHeader}>
                <p className={styles.dateLabel}>
                  {dateLabel}
                </p>
                <span className={styles.dateCount}>
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
        <div className={styles.listFooter}>
          <span className={styles.footerCount}>
            {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''}
          </span>
          <div className={styles.footerTotals}>
            {totalIngresos > 0 && (
              <span className={styles.footerIncome}>
                +{formatCOPCompact(totalIngresos)}
              </span>
            )}
            {totalGastos > 0 && (
              <span className={styles.footerExpense}>
                -{formatCOPCompact(totalGastos)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>

    {/* Barra flotante de cambios pendientes */}
    {pendingCount > 0 && typeof document !== 'undefined' && createPortal(
      <div className={styles.pendingBarWrap}>
        <div className={styles.pendingBar}>
          <span className={styles.pendingLabel}>
            {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
          </span>
          <div className={styles.pendingActions}>
            <button
              onClick={() => setPendingCats({})}
              className={styles.discardBtn}
            >
              Descartar
            </button>
            <button
              onClick={saveCategories}
              disabled={isSaving}
              className={`${styles.saveBtn} ${isSaving ? styles.saveBtnSaving : savedOk ? styles.saveBtnSaved : styles.saveBtnNormal}`}
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
        budgetedCats={budgetedCats}
      />
    )}
    </>
  )
}
