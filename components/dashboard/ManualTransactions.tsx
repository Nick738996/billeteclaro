'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, RefreshCw } from 'lucide-react'
import { CATEGORIA_LABELS, type Categoria, type TipoTransaccion, type Banco } from '@/lib/types'
import { TEST_IDS } from '@/lib/testIds'

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

  const inputStyle = { padding: '5px 8px', width: '100%' }

  return (
    <div className="card">
      <div style={{ padding: '12px 16px 16px' }}>

          {/* Filas de transacciones */}
          {items.map((item, idx) => (
            <div key={item._key} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: idx < items.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
                  Transacción {idx + 1}
                </span>
                {items.length > 1 && (
                  <button onClick={() => remove(item._key)} aria-label={`Eliminar transacción ${idx + 1}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {/* Fila 1: fecha + monto */}
              <div className="flex gap-2" style={{ marginBottom: 6 }}>
                <input
                  className="input-field"
                  type="datetime-local"
                  value={item.fecha}
                  onChange={e => update(item._key, 'fecha', e.target.value)}
                  aria-label={`Fecha de la transacción ${idx + 1}`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div className="flex items-center gap-1" style={{ flex: 1 }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true">$</span>
                  <input
                    className="input-field"
                    value={item.monto}
                    onChange={e => update(item._key, 'monto', e.target.value)}
                    placeholder="0"
                    aria-label={`Monto de la transacción ${idx + 1}`}
                    style={{ ...inputStyle }}
                  />
                </div>
              </div>

              {/* Fila 2: comercio */}
              <input
                className="input-field"
                value={item.comercio}
                onChange={e => update(item._key, 'comercio', e.target.value)}
                placeholder="Comercio o descripción"
                aria-label={`Comercio de la transacción ${idx + 1}`}
                style={{ ...inputStyle, marginBottom: 6 }}
              />

              {/* Fila 3: tipo + banco + categoría */}
              <div className="flex gap-2">
                <select className="input-field" value={item.tipo} onChange={e => update(item._key, 'tipo', e.target.value)} aria-label={`Tipo de la transacción ${idx + 1}`} style={{ ...inputStyle, flex: 1 }}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select className="input-field" value={item.banco} onChange={e => update(item._key, 'banco', e.target.value)} aria-label={`Banco de la transacción ${idx + 1}`} style={{ ...inputStyle, flex: 1 }}>
                  {BANCOS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
                <select className="input-field" value={item.categoria} onChange={e => update(item._key, 'categoria', e.target.value)} aria-label={`Categoría de la transacción ${idx + 1}`} style={{ ...inputStyle, flex: 1 }}>
                  {ALL_CATS.map(c => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
                </select>
              </div>
            </div>
          ))}

          {/* Agregar otra fila */}
          <button
            onClick={addRow}
            className="flex items-center gap-1.5"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: 0, marginBottom: 14 }}
          >
            <Plus size={11} /> Agregar otra
          </button>

          {error && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', marginBottom: 8 }}>{error}</p>}

          {/* Botón guardar */}
          <button
            onClick={handleSave}
            disabled={saving || !hasValid}
            className="w-full flex items-center justify-center gap-2"
            style={{
              padding: '9px 0',
              background: savedOk ? 'var(--green-soft)' : hasValid ? 'var(--surface-2)' : 'transparent',
              border: `1px solid ${savedOk ? 'var(--green)' : hasValid ? 'var(--text-muted)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              color: savedOk ? 'var(--green)' : hasValid ? 'var(--text)' : 'var(--text-subtle)',
              fontSize: 'var(--text-sm)', fontWeight: 500,
              cursor: saving || !hasValid ? 'default' : 'pointer',
              opacity: !hasValid ? 0.4 : 1,
            }}
          >
            {saving   ? <><RefreshCw size={13} className="animate-spin" /> Guardando…</> :
             savedOk  ? <><Check size={13} /> Guardadas</> :
                        `Guardar ${items.filter(i => parseFloat(i.monto.replace(/\D/g,'')) > 0).length || ''} transacción${items.filter(i => parseFloat(i.monto.replace(/\D/g,'')) > 0).length !== 1 ? 'es' : ''}`}
          </button>
        </div>
    </div>
  )
}
