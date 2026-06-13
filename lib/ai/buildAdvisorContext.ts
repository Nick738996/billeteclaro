import { format, getDaysInMonth, getDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Transaction, AdvisorContext, Categoria } from '@/lib/types'
import { isGasto, isIngreso } from '@/lib/types'

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

export function buildAdvisorContext(
  mes: string,
  transactions: Transaction[],
  budgets: Record<string, number>
): AdvisorContext {
  const ref = parseISO(`${mes}-01`)
  const today = new Date()
  const diasTotalesMes = getDaysInMonth(ref)
  const isCurrentMonth =
    today.getFullYear() === ref.getFullYear() && today.getMonth() === ref.getMonth()

  // dias_transcurridos
  let diasTranscurridos: number
  if (isCurrentMonth) {
    const primerDiaMes = new Date(today.getFullYear(), today.getMonth(), 1)
    diasTranscurridos = Math.max(
      1,
      Math.floor((today.getTime() - primerDiaMes.getTime()) / (1000 * 60 * 60 * 24)) + 1
    )
  } else {
    diasTranscurridos = diasTotalesMes
  }
  const diasRestantes = isCurrentMonth ? diasTotalesMes - diasTranscurridos : 0

  // Días hasta el próximo domingo (0 = domingo)
  const diaSemana = getDay(today)
  const diasRestantesSemana = diaSemana === 0 ? 0 : 7 - diaSemana

  const gastosPorCategoria = transactions
    .filter(t => isGasto(t.tipo, t.categoria))
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

  // Métricas calculadas
  const porcentajeMesTranscurrido = Math.round(diasTranscurridos / diasTotalesMes * 100)
  const gastoDiarioPromedio = diasTranscurridos > 0
    ? Math.round(totalGastado / diasTranscurridos)
    : 0
  const proyeccionCierre = Math.round(gastoDiarioPromedio * diasTotalesMes)
  const excesoProyectado = proyeccionCierre - totalPresupuestado
  const gastoEsperadoAEstaFecha = Math.round(totalPresupuestado * diasTranscurridos / diasTotalesMes)
  const diferenciaVsEsperado = totalGastado - gastoEsperadoAEstaFecha

  // top_3_gastos — agrupar por comercio (excluye TRANSFERENCIA implícitamente via isGasto)
  const comercioMap = new Map<string, { monto: number; categoria: string; count: number }>()
  for (const t of transactions.filter(t => isGasto(t.tipo, t.categoria))) {
    const key = t.comercio ?? 'Sin nombre'
    const prev = comercioMap.get(key) ?? { monto: 0, categoria: t.categoria, count: 0 }
    comercioMap.set(key, { monto: prev.monto + t.monto, categoria: t.categoria, count: prev.count + 1 })
  }
  const top3Gastos = [...comercioMap.entries()]
    .sort((a, b) => b[1].monto - a[1].monto)
    .slice(0, 3)
    .map(([comercio, d]) => ({
      comercio: toTitleCase(comercio),
      monto: d.monto,
      categoria: d.categoria,
      num_transacciones: d.count,
    }))

  // Clasificación de categorías
  const categoriasExcedidas: string[] = []
  const categoriasEnRiesgo: string[] = []
  const categoriasSinPresupuesto: string[] = []

  for (const [cat, gasto] of Object.entries(gastosPorCategoria)) {
    if (cat === 'TRANSFERENCIA') continue
    const presupuesto = presupuestoPorCategoria[cat as Categoria] ?? 0
    if (presupuesto > 0) {
      if (gasto > presupuesto) categoriasExcedidas.push(cat)
      else if (gasto > presupuesto * 0.8) categoriasEnRiesgo.push(cat)
    } else {
      categoriasSinPresupuesto.push(cat)
    }
  }

  // top_categoria_excedida — la más crítica por exceso absoluto
  const excedidasDetalle = Object.entries(gastosPorCategoria)
    .filter(([cat, gasto]) => {
      const presupuesto = presupuestoPorCategoria[cat as Categoria] ?? 0
      return cat !== 'TRANSFERENCIA' && presupuesto > 0 && gasto > presupuesto
    })
    .map(([cat, gasto]) => {
      const presupuesto = presupuestoPorCategoria[cat as Categoria]
      return {
        categoria: cat,
        gasto,
        presupuesto,
        exceso: gasto - presupuesto,
        porcentaje: Math.round(gasto / presupuesto * 100),
        top_comercio: top3Gastos.find(t => t.categoria === cat)?.comercio,
      }
    })
    .sort((a, b) => b.exceso - a.exceso)

  const topCategoriaExcedida = excedidasDetalle[0] ?? null

  return {
    mes: format(ref, 'MMMM yyyy', { locale: es }),
    dias_transcurridos: diasTranscurridos,
    dias_restantes: diasRestantes,
    dias_totales_mes: diasTotalesMes,
    dias_restantes_semana: diasRestantesSemana,
    total_gastado: totalGastado,
    total_presupuestado: totalPresupuestado,
    ingreso_estimado: ingresoEstimado,
    gastos_por_categoria: gastosPorCategoria,
    presupuesto_por_categoria: presupuestoPorCategoria,
    porcentaje_mes_transcurrido: porcentajeMesTranscurrido,
    gasto_diario_promedio: gastoDiarioPromedio,
    proyeccion_cierre: proyeccionCierre,
    exceso_proyectado: excesoProyectado,
    gasto_esperado_a_esta_fecha: gastoEsperadoAEstaFecha,
    diferencia_vs_esperado: diferenciaVsEsperado,
    categorias_excedidas: categoriasExcedidas,
    categorias_en_riesgo: categoriasEnRiesgo,
    categorias_sin_presupuesto: categoriasSinPresupuesto,
    top_3_gastos: top3Gastos,
    top_categoria_excedida: topCategoriaExcedida,
  }
}

export function hashContext(ctx: AdvisorContext): string {
  const relevant = {
    total_gastado:           ctx.total_gastado,
    gastos_por_categoria:    ctx.gastos_por_categoria,
    presupuesto_por_categoria: ctx.presupuesto_por_categoria,
    dias_transcurridos:      ctx.dias_transcurridos,
    top_3:                   ctx.top_3_gastos.map(t => `${t.comercio}:${t.monto}`),
  }
  return JSON.stringify(relevant)
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0)
    .toString()
}
