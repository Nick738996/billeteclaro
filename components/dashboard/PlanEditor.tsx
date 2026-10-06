'use client'

// PlanEditor — el plan del mes, en el orden de "págate primero":
// ingreso → ahorro → fijos → imprevistos → lo que queda es tu día a día.
//
// Antes el plan se llenaba de memoria: ponía $2,5 millones de ahorro, $2,2
// millones de día a día y nada para imprevistos, cuando en un mes normal el
// día a día era $3,4 millones y cada mes aparecía un gasto grande. Ahora
// arriba se ve dónde se va la plata en un mes normal (planReality.ts) y el día
// a día sale como resultado: si queda por debajo de lo normal, se ve de
// inmediato cuánto hay que recortar y cuánto es por semana.

import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { catLabel, formatCOP, formatCOPCompact, type BudgetSubcat } from '@/lib/types'
import { diaADiaDelPlan, type Historial } from '@/lib/services/planReality'
import styles from './PlanEditor.module.css'

export interface PlanCompleto {
  ingresoNetoMensual: number
  fijoTotalMonto: number
  ahorroMetaMonto: number
  imprevistosMonto?: number
  fijoItems?: BudgetSubcat[]
  ahorroItems?: BudgetSubcat[]
}

interface Props {
  mes: string
  mesLabel: string
  plan: PlanCompleto | null
  historial: Historial | null
  /** Lo que te ha entrado como ingreso este mes */
  recibidoMes: number
  onSaved: () => void
  onClose: () => void
}

const toNum = (v: string) => parseInt(v.replace(/\D/g, ''), 10) || 0
const fmtInput = (n: number) => (n > 0 ? n.toLocaleString('es-CO') : '')

function MoneyInput({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  return (
    <div className={styles.money}>
      <span className={styles.currency}>$</span>
      <input
        className={styles.moneyInput}
        value={fmtInput(value)}
        onChange={e => onChange(toNum(e.target.value))}
        inputMode="numeric"
        placeholder="0"
        disabled={disabled}
        aria-label={label}
      />
    </div>
  )
}

function Sugerencia({ texto, valor, actual, onUsar }: { texto: string; valor: number; actual: number; onUsar: () => void }) {
  const igual = Math.round(valor) === Math.round(actual)
  return (
    <p className={styles.hint}>
      {texto}: <strong>{formatCOPCompact(valor)}</strong>
      {!igual && <> · <button className={styles.link} onClick={onUsar}>Usar</button></>}
    </p>
  )
}

// ¿Dónde se va tu plata? Un mes normal contra lo que te entra, con la guía
// 50/30/20: fijos hasta el 50%, día a día + imprevistos hasta el 30%, y al
// menos 20% para ahorrar. Señala la parte que más se pasa.
function Diagnostico({ normal, ingreso, meses, onLlenar }: {
  normal: Historial['mesNormal']
  ingreso: number
  meses: number
  onLlenar: () => void
}) {
  const pct = (n: number) => Math.round((n / ingreso) * 100)
  const variable = normal.diaADia + normal.imprevistos
  const excesoFijos = pct(normal.fijos) - 50
  const excesoVariable = pct(variable) - 30
  const total = normal.fijos + variable
  let veredicto: string
  if (excesoFijos <= 0 && excesoVariable <= 0) veredicto = 'Tus gastos están dentro de lo sano: el reto es apartar el ahorro primero.'
  else if (excesoVariable >= excesoFijos) veredicto = `Lo que más se pasa es lo variable: día a día e imprevistos se llevan el ${pct(variable)}% de lo que te entra (lo sano es hasta 30%).`
  else veredicto = `Lo que más se pasa son los fijos: se llevan el ${pct(normal.fijos)}% de lo que te entra (lo sano es hasta 50%).`

  const filas: { label: string; monto: number; guia: string; mal: boolean }[] = [
    { label: 'Fijos', monto: normal.fijos, guia: 'hasta 50%', mal: excesoFijos > 0 },
    { label: 'Día a día', monto: normal.diaADia, guia: '', mal: excesoVariable > 0 },
    { label: 'Imprevistos', monto: normal.imprevistos, guia: '', mal: excesoVariable > 0 },
  ]
  return (
    <div className={styles.reality}>
      <p className={styles.realityTitle}>Dónde se va tu plata en un mes normal</p>
      <ul className={styles.diag}>
        {filas.map(f => (
          <li key={f.label} className={styles.diagRow}>
            <span>{f.label}</span>
            <span className={styles.diagBar} aria-hidden="true">
              <span style={{ width: `${Math.min(100, (f.monto / ingreso) * 100)}%`, background: f.mal ? 'var(--red)' : 'var(--green)' }} />
            </span>
            <span className={styles.diagNum}>{formatCOPCompact(f.monto)} · {pct(f.monto)}%</span>
          </li>
        ))}
      </ul>
      <p className={styles.diagTotal}>
        Total {formatCOPCompact(total)} de {formatCOPCompact(ingreso)} que te entran
        {total > ingreso && <span className={styles.red}> · gastas más de lo que ganas</span>}
      </p>
      <p className={styles.verdict}>{veredicto}</p>
      <p className={styles.realitySub}>Basado en tus {meses} meses anteriores (la mediana, para que un mes raro no lo distorsione).</p>
      <button className={styles.secondary} onClick={onLlenar}>Usar mis fijos e imprevistos reales</button>
    </div>
  )
}

export default function PlanEditor({ mes, mesLabel, plan, historial: h, recibidoMes, onSaved, onClose }: Props) {
  const normal = h?.mesNormal
  const diasMes = (() => { const [y, m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate() })()

  // Plan existente: el día a día es lo que dejaba libre. Plan nuevo: tu mes normal.
  const [ingreso, setIngreso] = useState(plan?.ingresoNetoMensual || recibidoMes || Math.round(normal?.recibido ?? 0))
  const [fijos, setFijos] = useState(plan ? plan.fijoTotalMonto : Math.round(normal?.fijos ?? 0))
  const [items, setItems] = useState<BudgetSubcat[]>(plan?.fijoItems ?? [])
  const [imprevistos, setImprevistos] = useState(plan ? (plan.imprevistosMonto ?? 0) : Math.round(normal?.imprevistos ?? 0))
  const ingresoInicial = plan?.ingresoNetoMensual || recibidoMes || Math.round(normal?.recibido ?? 0)
  const [ahorro, setAhorro] = useState(plan ? plan.ahorroMetaMonto : Math.round(ingresoInicial * 0.1 / 10_000) * 10_000)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conDesglose = items.length > 0
  const fijosTotal = conDesglose ? items.reduce((s, i) => s + i.monto, 0) : fijos
  // Págate primero: el día a día es lo que queda después de ahorrar, pagar
  // fijos y reservar para imprevistos.
  const diaADia = diaADiaDelPlan({ ingreso, ahorro, fijos: fijosTotal, imprevistos })
  const porSemana = Math.max(0, diaADia) / (diasMes / 7)
  const recorte = normal && normal.diaADia > 0 ? 1 - diaADia / normal.diaADia : 0

  const usarMesNormal = () => {
    if (!normal) return
    if (conDesglose) usarFijosNormales()
    else setFijos(Math.round(normal.fijos))
    setImprevistos(Math.round(normal.imprevistos))
  }
  // Con desglose, los fijos son la suma de los ítems: no se inventa un ítem
  // genérico ("Otros fijos" nunca se podría chulear); se dice cuánto falta y
  // el usuario agrega el fijo que de verdad le falta.
  const usarFijosNormales = () => {
    if (!normal || conDesglose) return
    setFijos(Math.round(normal.fijos))
  }
  const faltaEnDesglose = normal && conDesglose ? Math.round(normal.fijos) - fijosTotal : 0

  const guardar = async () => {
    if (ingreso <= 0) { setError('Escribe tu ingreso del mes'); return }
    if (diaADia < 0) { setError('Tu ahorro, fijos e imprevistos superan lo que te entra. Baja alguno antes de guardar.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/monthly-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes,
          ingresoNetoMensual: ingreso,
          fijoTotalMonto: fijosTotal,
          fijoItems: items.filter(i => i.nombre.trim() || i.monto > 0),
          imprevistosMonto: imprevistos,
          ahorroMetaMonto: ahorro,
          ahorroItems: plan?.ahorroItems ?? [],
        }),
      })
      if (!res.ok) throw new Error()
      onSaved()
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }


  return (
    <section className={`card ${styles.root}`}>
      <div className={styles.header}>
        <p className={styles.title}>Tu plan de {mesLabel}</p>
        <button className={styles.close} onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
      </div>

      {normal && ingreso > 0 ? (
        <Diagnostico normal={normal} ingreso={ingreso} meses={h!.meses.length} onLlenar={usarMesNormal} />
      ) : !normal ? (
        <p className={styles.realitySub}>Aún no hay meses anteriores para comparar. Llena el plan con tus mejores cálculos.</p>
      ) : null}

      {/* Ingreso */}
      <div className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.label}>Te entra este mes</span>
          <MoneyInput value={ingreso} onChange={setIngreso} label="Ingreso del mes" />
        </div>
        {recibidoMes > 0 && <Sugerencia texto="Ya te han entrado" valor={recibidoMes} actual={ingreso} onUsar={() => setIngreso(recibidoMes)} />}
      </div>

      {/* Ahorro: primero */}
      <div className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.label}>Ahorro <span className={styles.badge}>primero</span></span>
          <MoneyInput value={ahorro} onChange={setAhorro} label="Ahorro del mes" />
        </div>
        <p className={styles.desc}>Apártalo apenas te llegue el sueldo, antes de gastar. Lo sano es entre el 10% y el 20% de lo que te entra.</p>
        {ingreso > 0 && (
          <div className={styles.chips}>
            {[10, 15, 20].map(p => {
              const v = Math.round(ingreso * p / 100 / 10_000) * 10_000
              return (
                <button key={p} className={`${styles.chip} ${ahorro === v ? styles.chipOn : ''}`} onClick={() => setAhorro(v)}>
                  {p}%: {formatCOPCompact(v)}
                </button>
              )
            })}
          </div>
        )}
        {normal && <p className={styles.hint}>En un mes normal terminas ahorrando <strong>{formatCOPCompact(Math.max(0, normal.ahorroNeto))}</strong> (lo que metes menos lo que sacas).</p>}
      </div>

      {/* Fijos */}
      <div className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.label}>Fijos</span>
          <MoneyInput value={fijosTotal} onChange={setFijos} disabled={conDesglose} label="Gastos fijos" />
        </div>
        <p className={styles.desc}>Arriendo, servicios, suscripciones, deudas: lo que pagas sí o sí.</p>
        {normal && !conDesglose && <Sugerencia texto="Tu mes normal" valor={normal.fijos} actual={fijosTotal} onUsar={usarFijosNormales} />}
        {normal && conDesglose && (
          <p className={styles.hint}>
            Tu mes normal: <strong>{formatCOPCompact(normal.fijos)}</strong>
            {faltaEnDesglose > 50_000 && <> · te faltan ~{formatCOPCompact(faltaEnDesglose)} en ítems. Agrega el fijo que no está (servicios, una cuota…).</>}
          </p>
        )}
        {conDesglose ? (
          <div className={styles.items}>
            {items.map((it, idx) => (
              <div key={idx} className={styles.item}>
                <input
                  className={styles.itemName}
                  value={it.nombre}
                  onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, nombre: e.target.value } : x))}
                  placeholder="Ej. Arriendo"
                  aria-label="Nombre del fijo"
                />
                <MoneyInput
                  value={it.monto}
                  onChange={n => setItems(items.map((x, i) => i === idx ? { ...x, monto: n } : x))}
                  label={`Monto de ${it.nombre || 'fijo'}`}
                />
                <button className={styles.itemRemove} onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="Quitar">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button className={styles.link} onClick={() => setItems([...items, { nombre: '', monto: 0 }])}>
              <Plus size={12} /> Agregar fijo
            </button>
          </div>
        ) : (
          <button className={styles.link} onClick={() => setItems([{ nombre: '', monto: fijos }])}>
            Desglosar (arriendo, servicios…) para chulearlos cada mes
          </button>
        )}
      </div>

      {/* Imprevistos */}
      <div className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.label}>Imprevistos</span>
          <MoneyInput value={imprevistos} onChange={setImprevistos} label="Imprevistos" />
        </div>
        <p className={styles.desc}>Lo que no estaba en ninguna categoría (todo lo que cae en Imprevisto) y los gastos grandes que no esperabas: un viaje, un regalo, algo que se dañó.</p>
        {normal && <Sugerencia texto="Tu mes normal" valor={normal.imprevistos} actual={imprevistos} onUsar={() => setImprevistos(Math.round(normal.imprevistos))} />}
        {h && h.imprevistosTxs.length > 0 && (
          <p className={styles.examples}>
            Los últimos: {h.imprevistosTxs.slice(0, 3).map(t => `${(t.comercio ?? catLabel(t.categoria)).split(' ').slice(0, 3).join(' ')} ${formatCOPCompact(t.monto)}`).join(', ')}
          </p>
        )}
      </div>

      {/* Resultado: lo que queda es tu día a día */}
      <div className={`${styles.result} ${diaADia < 0 ? styles.resultBad : recorte > 0.05 ? styles.resultWarn : ''}`}>
        <div className={styles.rowHead}>
          <span className={styles.resultLabel}>{diaADia < 0 ? 'Te faltan' : 'Te queda para el día a día'}</span>
          <span className={styles.resultAmount}>{formatCOP(Math.abs(diaADia))}</span>
        </div>
        {diaADia >= 0 && <p className={styles.resultWeek}>{formatCOPCompact(porSemana)} por semana para salidas, transporte, compras…</p>}
        {diaADia >= 0 && (
          <p className={styles.resultSplit}>
            Variables: <strong>{formatCOPCompact(diaADia + imprevistos)}</strong> = día a día {formatCOPCompact(diaADia)} + imprevistos {formatCOPCompact(imprevistos)}
          </p>
        )}
        <p className={styles.resultHint}>
          {diaADia < 0
            ? 'Tu ahorro, fijos e imprevistos ya superan lo que te entra. Baja el ahorro o algún fijo.'
            : !normal
              ? ''
              : recorte > 0.05
                ? `En un mes normal tu día a día es ${formatCOPCompact(normal.diaADia)}: este plan te pide gastar un ${Math.round(recorte * 100)}% menos. Esa es tu meta de la semana.`
                : `Alcanza para tu día a día normal (${formatCOPCompact(normal.diaADia)}).`}
        </p>
      </div>

      {h && recorte > 0.05 && h.diaADiaPorCategoria.length > 0 && (
        <div className={styles.cuts}>
          <p className={styles.cutsTitle}>Dónde se va tu día a día (promedio al mes)</p>
          <ul className={styles.cutsList}>
            {h.diaADiaPorCategoria.slice(0, 5).map(c => (
              <li key={c.categoria}>
                <span>{catLabel(c.categoria)}</span>
                <span>{formatCOPCompact(c.monto)}</span>
              </li>
            ))}
          </ul>
          <p className={styles.cutsHint}>
            Para recortar {formatCOPCompact(normal!.diaADia - Math.max(0, diaADia))} al mes, empieza por la más grande que sí controlas.
          </p>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={onClose}>Cancelar</button>
        <button className={styles.primary} onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar plan'}</button>
      </div>
    </section>
  )
}
