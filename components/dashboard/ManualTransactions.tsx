'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, RefreshCw, X } from 'lucide-react'
import { CATEGORIA_LABELS, type Categoria, type TipoTransaccion, type Banco } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'
import styles from './ManualTransactions.module.css'

const ALL_CATS = Object.keys(CATEGORIA_LABELS) as Categoria[]

interface DraftTx {
  _key:      number
  fecha:     string
  monto:     string
  comercio:  string
  categoria: Categoria
  tipo:      TipoTransaccion
  banco:     Banco
}

const TIPOS: { value: TipoTransaccion; label: string }[] = [
  { value: 'COMPRA',                label: 'Compra' },
  { value: 'PAGO_SERVICIO',         label: 'Pago servicio' },
  { value: 'TRANSFERENCIA_ENVIADA', label: 'Transferencia enviada' },
  { value: 'INGRESO',               label: 'Ingreso' },
  { value: 'RETIRO',                label: 'Retiro' },
]

const BANCOS: { value: Banco; label: string }[] = [
  { value: 'RAPPICARD', label: 'RappiCard' },
  { value: 'RAPPIPAY',  label: 'RappiPay' },
  { value: 'OTRO',      label: 'Otro banco' },
]

const today = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

let keyCounter = 0
const newDraft = (): DraftTx => ({
  _key:      ++keyCounter,
  fecha:     today(),
  monto:     '',
  comercio:  '',
  categoria: 'OTRO',
  tipo:      'COMPRA',
  banco:     'OTRO',
})

interface Props {
  onSaved: () => void
  onClose: () => void
}

export default function ManualTransactions({ onSaved, onClose }: Props) {
  const [items,   setItems]   = useState<DraftTx[]>([newDraft()])
  const [saving,  setSaving]  = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const hasValid = items.some(i => i.monto && parseFloat(i.monto.replace(/\D/g,'')) > 0)

  const update = (key: number, field: keyof DraftTx, value: string) =>
    setItems(prev => prev.map(i => i._key === key ? { ...i, [field]: value } : i))

  const addRow  = () => setItems(prev => [...prev, newDraft()])
  const remove  = (key: number) => setItems(prev => prev.filter(i => i._key !== key))

  const handleSave = async () => {
    const valid = items.filter(i => parseFloat(i.monto.replace(/\D/g,'')) > 0)
    if (!valid.length) return
    setSaving(true); setError(null)
    try {
      const payload = valid.map(i => ({
        fecha:     i.fecha,
        monto:     parseFloat(i.monto.replace(/\D/g,'')),
        comercio:  i.comercio.trim() || 'Manual',
        categoria: i.categoria,
        tipo:      i.tipo,
        banco:     i.banco,
      }))
      const res = await fetch('/api/transactions/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setSavedOk(true)
      setItems([newDraft()])
      onSaved()
      setTimeout(() => { setSavedOk(false); onClose() }, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const saveBtnClass = [
    styles.saveBtn,
    savedOk   ? styles.saveBtnSaved   :
    hasValid  ? styles.saveBtnActive  : '',
    saving    ? styles.saveBtnSaving  : '',
  ].join(' ')

  return (
    <div className={`card ${styles.container}`}>

      {/* Header */}
      <div className={styles.header}>
        <p className={styles.headerTitle}>Nueva transacción</p>
        <button
          onClick={onClose}
          aria-label="Cerrar formulario"
          className={styles.closeBtn}
        >
          <X size={15} />
        </button>
      </div>

      <div className={styles.body}>

        {/* Filas de transacciones */}
        {items.map((item, idx) => (
          <div
            key={item._key}
            className={`${styles.draftRow} ${idx < items.length - 1 ? styles.draftRowSeparated : ''}`}
          >
            <div className={styles.draftRowHeader}>
              <span className={styles.rowLabel}>Transacción {idx + 1}</span>
              {items.length > 1 && (
                <button
                  onClick={() => remove(item._key)}
                  aria-label={`Eliminar transacción ${idx + 1}`}
                  className={styles.removeBtn}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {/* Fila 1: fecha + monto */}
            <div className={styles.fieldRow}>
              <input
                className={`input-field ${styles.inputOverride}`}
                type="datetime-local"
                value={item.fecha}
                onChange={e => update(item._key, 'fecha', e.target.value)}
                aria-label={`Fecha de la transacción ${idx + 1}`}
              />
              <div className={styles.amountWrapper}>
                <span className={styles.currencySymbol} aria-hidden="true">$</span>
                <input
                  className={`input-field ${styles.inputOverride}`}
                  value={item.monto}
                  onChange={e => update(item._key, 'monto', e.target.value)}
                  placeholder="0"
                  aria-label={`Monto de la transacción ${idx + 1}`}
                />
              </div>
            </div>

            {/* Fila 2: comercio */}
            <input
              className={`input-field ${styles.comercioInput}`}
              value={item.comercio}
              onChange={e => update(item._key, 'comercio', e.target.value)}
              placeholder="Comercio o descripción"
              aria-label={`Comercio de la transacción ${idx + 1}`}
            />

            {/* Fila 3: tipo + banco + categoría */}
            <div className={styles.selectsRow}>
              <select
                className={`input-field ${styles.inputOverride}`}
                value={item.tipo}
                onChange={e => update(item._key, 'tipo', e.target.value)}
                aria-label={`Tipo de la transacción ${idx + 1}`}
              >
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select
                className={`input-field ${styles.inputOverride}`}
                value={item.banco}
                onChange={e => update(item._key, 'banco', e.target.value)}
                aria-label={`Banco de la transacción ${idx + 1}`}
              >
                {BANCOS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <select
                className={`input-field ${styles.inputOverride}`}
                value={item.categoria}
                onChange={e => update(item._key, 'categoria', e.target.value)}
                aria-label={`Categoría de la transacción ${idx + 1}`}
              >
                {ALL_CATS.map(c => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
        ))}

        {/* Agregar otra fila */}
        <button onClick={addRow} className={styles.addBtn}>
          <Plus size={11} /> Agregar otra
        </button>

        {error && <p className={styles.error}>{error}</p>}

        {/* Botón guardar */}
        <button
          onClick={handleSave}
          disabled={saving || !hasValid}
          className={saveBtnClass}
        >
          {saving   ? <><RefreshCw size={13} className="animate-spin" /> Guardando…</> :
           savedOk  ? <><Check size={13} /> Guardadas</> :
                      `Guardar ${items.filter(i => parseFloat(i.monto.replace(/\D/g,'')) > 0).length || ''} transacción${items.filter(i => parseFloat(i.monto.replace(/\D/g,'')) > 0).length !== 1 ? 'es' : ''}`}
        </button>
      </div>
    </div>
  )
}
