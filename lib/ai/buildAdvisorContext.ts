import { format, getDaysInMonth, getDay, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Transaction, AdvisorContext, Categoria } from '@/lib/types'
import { isGasto, isIngreso } from '@/lib/types'

export function buildAdvisorContext(
  mes: string,
  transactions: Transaction[],
  budgets: Record<string, number>
): AdvisorContext {
  const ref = parseISO(`${mes}-01`)
  const today = new Date()
  const totalDias = getDaysInMonth(ref)
  const diaActual = today.getFullYear() === ref.getFullYear() && today.getMonth() === ref.getMonth()
    ? today.getDate()
    : totalDias

  const diasTranscurridos = diaActual
  const diasRestantes = totalDias - diaActual

  // Días hasta el próximo domingo (0 = domingo, 1 = lunes, ...)
  const diaSemana = getDay(today) // 0=dom, 1=lun, ..., 6=sab
  const diasRestantesSemana = diaSemana === 0 ? 0 : 7 - diaSemana

  const gastosPorCategoria = transactions
    .filter(t => isGasto(t.tipo))
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.categoria] = (acc[t.categoria] ?? 0) + t.monto
      return acc
    }, {}) as Record<Categoria, number>

  const ingresoEstimado = transactions
    .filter(t => isIngreso(t.tipo))
    .reduce((s, t) => s + t.monto, 0)

  const presupuestoPorCategoria = { ...budgets } as Record<Categoria, number>

  const totalGastado = Object.values(gastosPorCategoria).reduce((s, v) => s + v, 0)
  const totalPresupuestado = Object.values(presupuestoPorCategoria).reduce((s, v) => s + v, 0)

  return {
    mes: format(ref, 'MMMM yyyy', { locale: es }),
    dias_transcurridos: diasTranscurridos,
    dias_restantes: diasRestantes,
    dias_restantes_semana: diasRestantesSemana,
    gastos_por_categoria: gastosPorCategoria,
    presupuesto_por_categoria: presupuestoPorCategoria,
    total_gastado: totalGastado,
    total_presupuestado: totalPresupuestado,
    ingreso_estimado: ingresoEstimado,
  }
}

export function hashContext(ctx: AdvisorContext): string {
  // Solo datos financieros — el tiempo (días transcurridos/restantes) no cambia los insights
  const financial = {
    gastos:      ctx.gastos_por_categoria,
    presupuesto: ctx.presupuesto_por_categoria,
    ingresos:    ctx.ingreso_estimado,
  }
  const str = JSON.stringify(financial)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}
