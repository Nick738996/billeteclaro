'use client'

// LayerDetail — lo que se ve al tocar Ahorro / Fijo / Variable en Tu Plan.
// Antes ese panel solo repetía el mismo par de números en formato largo. Ahora
// responde las tres preguntas que el usuario de verdad se hace al tocar:
//   1. ¿Qué significa esto? → una frase de lectura (insight)
//   2. ¿De dónde sale el límite/meta? → la cuenta del plan, explícita
//   3. ¿Qué transacciones forman el número? → desglose por categoría + las
//      más grandes. Tocar una categoría filtra la lista de transacciones.

import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { catLabel, formatCOP, formatCOPCompact, getCategoryColor, type Transaction } from '@/lib/types'
import { getCategoryIcon } from '@/lib/categoryIcons'
import styles from './LayerDetail.module.css'

export type LayerKind = 'ahorro' | 'fijo' | 'variable'

interface Props {
  kind: LayerKind
  /** Transacciones que SUMAN en esta capa (ya filtradas con countedCapa) */
  txs: Transaction[]
  total: number
  /** Meta (ahorro) o límite (fijo/variable) del plan; 0 = no configurado */
  limite: number
  /** La cuenta que produce `limite`, en palabras — ej. "Ingreso $9.6M − Fijos $4.9M − Ahorro $2.5M" */
  origen: string | null
  /** Días que le quedan al mes (0 si es un mes pasado) */
  diasRestantes: number
  activeFilter: string
  onFilterCategory: (categoria: string) => void
}

const TOP_N = 5

function displayName(t: Transaction): string {
  const raw = t.comercio?.trim() || t.descripcion?.trim() || catLabel(t.categoria)
  return raw.length > 32 ? `${raw.slice(0, 31)}…` : raw
}

export function buildLayerInsight(
  kind: LayerKind,
  total: number,
  limite: number,
  diasRestantes: number,
  top: Transaction | undefined
): string {
  if (limite <= 0) {
    return kind === 'ahorro'
      ? 'Aún no tienes meta de ahorro. Defínela en Editar para ver tu avance.'
      : 'Configura tu plan en Editar para ver contra qué se compara este gasto.'
  }

  const diff = limite - total

  if (kind === 'ahorro') {
    if (total === 0) {
      return `Aún no registras ahorro este mes. Cuenta cualquier salida que categorices como Ahorros o Inversión, te faltan ${formatCOPCompact(limite)}.`
    }
    return diff <= 0
      ? `Cumpliste tu meta de ahorro${diff < 0 ? ` y la superaste por ${formatCOPCompact(-diff)}` : ''}.`
      : `Llevas ${Math.round((total / limite) * 100)}% de tu meta. Te faltan ${formatCOPCompact(diff)} por apartar.`
  }

  if (kind === 'fijo') {
    return diff >= 0
      ? `Te quedan ${formatCOPCompact(diff)} de fijos por pagar este mes, según lo que declaraste.`
      : `Tus fijos van ${formatCOPCompact(-diff)} por encima de lo declarado. Revisa si algo aquí es en realidad variable, o sube el monto en Editar.`
  }

  // variable
  if (diff < 0) {
    const share = top ? top.monto / total : 0
    const culpable = top && share >= 0.4
      ? ` "${displayName(top)}" (${formatCOPCompact(top.monto)}) explica el ${Math.round(share * 100)}% de lo gastado.`
      : ''
    return `Te pasaste ${formatCOPCompact(-diff)} de lo disponible para gasto variable este mes.${culpable}`
  }
  if (diasRestantes > 0) {
    return `Te quedan ${formatCOPCompact(diff)} para ${diasRestantes} días, unos ${formatCOPCompact(diff / diasRestantes)} por día.`
  }
  return `Cerraste el mes con ${formatCOPCompact(diff)} de margen en gasto variable.`
}

export default function LayerDetail({
  kind, txs, total, limite, origen, diasRestantes, activeFilter, onFilterCategory,
}: Props) {
  const byCat = new Map<string, { monto: number; count: number }>()
  for (const t of txs) {
    const prev = byCat.get(t.categoria) ?? { monto: 0, count: 0 }
    byCat.set(t.categoria, { monto: prev.monto + Number(t.monto), count: prev.count + 1 })
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1].monto - a[1].monto)
  const top = [...txs].sort((a, b) => b.monto - a.monto).slice(0, TOP_N)

  const insight = buildLayerInsight(kind, total, limite, diasRestantes, top[0])
  const over = limite > 0 && (kind === 'ahorro' ? false : total > limite)

  return (
    <div className={styles.root}>
      <p className={styles.insight} style={over ? { color: 'var(--red)' } : undefined}>{insight}</p>

      <div className={styles.summary}>
        <span className={styles.summaryTotal}>{formatCOP(total)}</span>
        {limite > 0 && (
          <span className={styles.summaryOf}>
            {kind === 'ahorro' ? ' de tu meta de ' : ' de '}{formatCOP(limite)}
          </span>
        )}
      </div>
      {origen && <p className={styles.origen}>{origen}</p>}

      {cats.length === 0 ? (
        <p className={styles.empty}>
          {kind === 'ahorro'
            ? 'Ninguna transacción de este mes está categorizada como Ahorros o Inversión.'
            : 'Sin transacciones en esta capa este mes.'}
        </p>
      ) : (
        <>
          <p className={styles.sectionLabel}>Por categoría</p>
          <ul className={styles.catList}>
            {cats.map(([cat, { monto, count }]) => {
              const Icon = getCategoryIcon(cat)
              const color = getCategoryColor(cat)
              const pct = total > 0 ? (monto / total) * 100 : 0
              const active = activeFilter === cat
              return (
                <li key={cat}>
                  <button
                    className={`${styles.catRow} ${active ? styles.catRowActive : ''}`}
                    onClick={() => onFilterCategory(cat)}
                    aria-pressed={active}
                    aria-label={`${catLabel(cat)}: ${formatCOP(monto)}, ${count} transacciones. ${active ? 'Quitar filtro' : 'Ver en la lista'}`}
                  >
                    <span className={styles.catIcon} style={{ color }}><Icon size={15} /></span>
                    <span className={styles.catName}>
                      {catLabel(cat)}
                      <span className={styles.catCount}>{count} {count === 1 ? 'mov.' : 'movs.'}</span>
                    </span>
                    <span className={styles.catAmount}>{formatCOPCompact(monto)}</span>
                    <span className={styles.catTrack} aria-hidden="true">
                      <span className={styles.catFill} style={{ width: `${pct}%`, background: color }} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <p className={styles.sectionLabel}>Lo que más pesó</p>
          <ul className={styles.txList}>
            {top.map(t => (
              <li key={t.id} className={styles.txRow}>
                <span className={styles.txName}>{displayName(t)}</span>
                <span className={styles.txMeta}>
                  {formatInTimeZone(new Date(t.fecha), 'America/Bogota', 'd MMM', { locale: es })} · {catLabel(t.categoria)}
                </span>
                <span className={styles.txAmount}>{formatCOPCompact(t.monto)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
