// Configuración de detección de sueldo
// El comercio debe matchear parcialmente (toLowerCase includes)
const FUENTES_SUELDO = ['citibank'] as const
const UMBRAL_SUELDO = 9_000_000
const VENTANA_DIAS = 5
const FALLBACK_DIAS = 3

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
  // Agrupar por mes calendario (slice(0,7) funciona tanto en ISO como en YYYY-MM-DD)
  const porMes = new Map<string, T[]>()
  for (const t of transacciones) {
    const mes = t.fecha.slice(0, 7)
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
        const dia = new Date(t.fecha).getDate()
        return dia >= inicioVentana && esSueldo(t)
      })
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0]

    // Fallback: ingreso grande sin comercio conocido (por si cambia el banco)
    const sueldoPorMonto = !sueldoPorComercio
      ? txsDelMes
          .filter(t => {
            const dia = new Date(t.fecha).getDate()
            const esIngreso = t.tipo === 'INGRESO' || t.tipo === 'TRANSFERENCIA_RECIBIDA'
            return dia >= inicioVentana && esIngreso && t.monto >= UMBRAL_SUELDO
          })
          .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0]
      : undefined

    const sueldo = sueldoPorComercio ?? sueldoPorMonto

    for (const t of txsDelMes) {
      let mesContable: string

      if (sueldo) {
        // Transacciones >= timestamp del sueldo van al mes siguiente
        mesContable = new Date(t.fecha).getTime() >= new Date(sueldo.fecha).getTime()
          ? siguiente
          : mes
      } else {
        // Sin sueldo detectado: últimos FALLBACK_DIAS días → mes siguiente
        const dia = new Date(t.fecha).getDate()
        const inicioFallback = lastDay - FALLBACK_DIAS + 1
        mesContable = dia >= inicioFallback ? siguiente : mes
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
