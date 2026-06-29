// Configuración de detección de sueldo
// El comercio debe matchear parcialmente (toLowerCase includes)
const FUENTES_SUELDO = ['citibank'] as const
const UMBRAL_SUELDO = 9_000_000
const VENTANA_DIAS = 5

// Colombia es UTC-5 sin horario de verano
const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000

function toColombiaDate(fecha: string): string {
  return new Date(new Date(fecha).getTime() - COLOMBIA_OFFSET_MS).toISOString().slice(0, 10)
}

type TxBase = {
  fecha: string
  monto: number
  tipo: string
  comercio?: string | null
  descripcion?: string | null
}

function esSueldo(t: TxBase): boolean {
  const esIngreso = t.tipo === 'INGRESO' || t.tipo === 'TRANSFERENCIA_RECIBIDA'
  if (!esIngreso || t.monto < UMBRAL_SUELDO) return false

  // Buscar en comercio o descripción
  const texto = `${t.comercio ?? ''} ${t.descripcion ?? ''}`.toLowerCase()
  return FUENTES_SUELDO.some(fuente => texto.includes(fuente))
}

function lastDayOfMonth(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  // new Date(year, month, 0) = último día del mes anterior a `month` (0-indexed)
  // e.g. mes='2026-05' → m=5 → new Date(2026, 5, 0) = 31 mayo
  return new Date(y, m, 0).getDate()
}

function nextMonth(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Asigna mes_contable a cada transacción.
 *
 * Lógica: una vez detectado el sueldo dentro de los últimos VENTANA_DIAS días
 * del mes, esa transacción y todas las posteriores (mismo timestamp o después)
 * van al mes siguiente. Sin sueldo detectado, los últimos FALLBACK_DIAS días
 * van al mes siguiente.
 *
 * Marca es_sueldo: true en la transacción del sueldo para poder mostrarla
 * con un badge especial en la UI.
 */
export function asignarMesContable<T extends TxBase>(
  transacciones: T[]
): (T & { mes_contable: string; es_sueldo?: true })[] {
  // Agrupar por mes calendario en hora Colombia para evitar que transacciones
  // nocturnas (ej. 23:41 COL = 04:41 UTC del día siguiente) cambien de mes
  const porMes = new Map<string, T[]>()
  for (const t of transacciones) {
    const mes = toColombiaDate(t.fecha).slice(0, 7)
    if (!porMes.has(mes)) porMes.set(mes, [])
    porMes.get(mes)!.push(t)
  }

  const resultado: (T & { mes_contable: string; es_sueldo?: true })[] = []

  for (const [mes, txsDelMes] of porMes) {
    const lastDay = lastDayOfMonth(mes)
    const siguiente = nextMonth(mes)
    const inicioVentana = lastDay - VENTANA_DIAS + 1

    // Detectar sueldo: primero buscar por comercio conocido, luego por monto solo
    const sueldoPorComercio = txsDelMes
      .filter(t => {
        const dia = parseInt(toColombiaDate(t.fecha).slice(8, 10), 10)
        return dia >= inicioVentana && esSueldo(t)
      })
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0]

    // Fallback: ingreso grande sin comercio conocido (por si cambia el banco)
    const sueldoPorMonto = !sueldoPorComercio
      ? txsDelMes
          .filter(t => {
            const dia = parseInt(toColombiaDate(t.fecha).slice(8, 10), 10)
            const esIngreso = t.tipo === 'INGRESO' || t.tipo === 'TRANSFERENCIA_RECIBIDA'
            return dia >= inicioVentana && esIngreso && t.monto >= UMBRAL_SUELDO
          })
          .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0]
      : undefined

    const sueldo = sueldoPorComercio ?? sueldoPorMonto

    for (const t of txsDelMes) {
      let mesContable: string

      if (sueldo) {
        // Todo el día del sueldo (y días posteriores) va al mes siguiente,
        // comparando en hora Colombia para que 23:41 COL no se confunda con
        // el día siguiente en UTC (04:41 UTC).
        mesContable = toColombiaDate(t.fecha) >= toColombiaDate(sueldo.fecha)
          ? siguiente
          : mes
      } else {
        // Sin sueldo ni ingreso grande detectado → todo el mes en su mes calendario
        mesContable = mes
      }

      resultado.push({
        ...t,
        mes_contable: mesContable,
        // Referencia exacta al objeto sueldo — evita falsos positivos por
        // coincidencia de fecha+monto entre transacciones distintas
        ...(t === sueldo ? { es_sueldo: true as const } : {}),
      })
    }
  }

  return resultado
}
