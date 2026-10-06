import { describe, it, expect } from 'vitest'
import {
  naturaleza,
  motivoRevision,
  computeMonthSummary,
  armarChecklistFijos,
  pagosRecurrentesFueraDelPlan,
} from '@/lib/services/monthSummary'
import type { Transaction } from '@/lib/types'
import { capasDelPlan } from '@/lib/services/planCategories'

let n = 0
function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: `t${++n}`,
    user_id: 'u1',
    gmail_message_id: `m${n}`,
    fecha: '2026-10-02T17:00:00Z',
    monto: 10_000,
    comercio: 'Comercio',
    descripcion: null,
    banco: 'RAPPICARD',
    tipo: 'COMPRA',
    categoria: 'SALIDAS',
    subcategoria: null,
    id_auditoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
    raw_snippet: null,
    procesado: true,
    mes_contable: '2026-10',
    es_sueldo: false,
    created_at: '2026-10-02T17:00:00Z',
    contraparte_id: null,
    capa_override: null,
    ...overrides,
  }
}

describe('naturaleza', () => {
  it('solo la categoría Ingreso es plata nueva', () => {
    expect(naturaleza(tx({ tipo: 'INGRESO', categoria: 'INGRESO' }), {})).toBe('INGRESO')
    expect(naturaleza(tx({ tipo: 'TRANSFERENCIA_RECIBIDA', categoria: 'PRESTAMO' }), {})).toBe('NO_CUENTA')
    expect(naturaleza(tx({ tipo: 'TRANSFERENCIA_RECIBIDA', categoria: 'ENTRE_CUENTAS' }), {})).toBe('NO_CUENTA')
  })

  it('un retiro de ahorros baja el ahorro, no es ingreso', () => {
    expect(naturaleza(tx({ tipo: 'INGRESO', categoria: 'INGRESO', subcategoria: 'retiro_ahorros' }), {})).toBe('AHORRO_RETIRO')
  })

  it('pago de tarjeta, préstamo dado y entre mis cuentas no cuentan', () => {
    expect(naturaleza(tx({ tipo: 'ABONO_DEUDA', categoria: 'DEUDA' }), {})).toBe('NO_CUENTA')
    expect(naturaleza(tx({ tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'PRESTAMO' }), {})).toBe('NO_CUENTA')
    expect(naturaleza(tx({ tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'ENTRE_CUENTAS' }), {})).toBe('NO_CUENTA')
  })

  it('una compra marcada con la versión anterior "pagado con ahorros" cuenta como gasto normal', () => {
    expect(naturaleza(tx({ categoria: 'OTRO', subcategoria: 'pagado_con_ahorros' }), {})).toBe('GASTO_VARIABLE')
  })

  it('fijo solo si la categoría es fija en el plan; las predeterminadas son día a día', () => {
    expect(naturaleza(tx({ categoria: 'HOGAR' }), {})).toBe('GASTO_VARIABLE')
    expect(naturaleza(tx({ categoria: 'ARRIENDO' }), { ARRIENDO: 'FIJO' })).toBe('GASTO_FIJO')
    expect(naturaleza(tx({ categoria: 'SALIDAS' }), {})).toBe('GASTO_VARIABLE')
    expect(naturaleza(tx({ categoria: 'DEPORTES' }), { DEPORTES: 'FIJO' })).toBe('GASTO_FIJO')
  })
})

describe('motivoRevision', () => {
  it('pregunta por transferencias recibidas que dicen ser ingreso', () => {
    expect(motivoRevision(tx({ tipo: 'TRANSFERENCIA_RECIBIDA', categoria: 'INGRESO' }))).toBe('ENTRADA')
    expect(motivoRevision(tx({ tipo: 'INGRESO', categoria: 'INGRESO' }))).toBeNull()
  })

  it('pregunta por salidas grandes sin categoría clara', () => {
    expect(motivoRevision(tx({ tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'TRANSFERENCIA', monto: 1_500_000 }))).toBe('SALIDA_GRANDE')
    expect(motivoRevision(tx({ tipo: 'COMPRA', categoria: 'OTRO', monto: 150_000 }))).toBeNull()
    expect(motivoRevision(tx({ tipo: 'ABONO_DEUDA', categoria: 'TRANSFERENCIA', monto: 900_000 }))).toBeNull()
  })

  it('no vuelve a preguntar si ya se confirmó', () => {
    expect(motivoRevision(tx({ tipo: 'TRANSFERENCIA_RECIBIDA', categoria: 'INGRESO', subcategoria: 'confirmado' }))).toBeNull()
  })
})

describe('computeMonthSummary (caso real octubre 2026)', () => {
  const plan = { ingresoNetoMensual: 9_625_461, fijoTotalMonto: 4_920_000, ahorroMetaMonto: 2_500_000 }
  const txs = [
    tx({ tipo: 'INGRESO', categoria: 'INGRESO', monto: 9_608_461, fecha: '2026-09-29T20:07:00Z' }),
    tx({ tipo: 'TRANSFERENCIA_RECIBIDA', categoria: 'PRESTAMO', monto: 1_526_000 }), // te pagaron
    tx({ tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'HOGAR', monto: 2_910_000 }),
    tx({ tipo: 'ABONO_DEUDA', categoria: 'DEUDA', monto: 750_000 }),
    tx({ tipo: 'COMPRA', categoria: 'SALIDAS', monto: 100_000, fecha: '2026-10-03T02:27:00Z' }),
    tx({ tipo: 'COMPRA', categoria: 'COMPRAS_ONLINE', monto: 422_787, fecha: '2026-10-05T15:14:00Z' }),
    tx({ tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'OTRO', monto: 2_690_000, subcategoria: 'pagado_con_ahorros' }),
    tx({ tipo: 'INGRESO', categoria: 'INGRESO', monto: 2_690_000, subcategoria: 'retiro_ahorros' }),
    tx({ tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'AHORROS', monto: 2_500_000, subcategoria: 'aporte_ahorros' }),
    tx({ tipo: 'TRANSFERENCIA_RECIBIDA', categoria: 'INGRESO', monto: 400_000 }), // Nubank, por revisar
  ]
  // El arriendo es fijo porque está en el plan (capasDelPlan lo marca así)
  const capas = { HOGAR: 'FIJO' as const }
  const s = computeMonthSummary(txs, capas, plan, '2026-10', '2026-10-06')

  it('recibido = solo categoría Ingreso, sin retiros ni cobros', () => {
    expect(s.recibido).toBe(9_608_461 + 400_000)
  })

  it('el pago de tarjeta no cuenta; la bici es gasto normal', () => {
    expect(s.fijoReal).toBe(2_910_000)
    expect(s.variableReal).toBe(522_787 + 2_690_000)
    expect(s.gastado).toBe(2_910_000 + 522_787 + 2_690_000)
  })

  it('ahorro neto = aportes − retiros', () => {
    expect(s.ahorroNeto).toBe(2_500_000 - 2_690_000)
  })

  it('la semana arranca el lunes 5 y no cuenta imprevistos (la compra de $423 mil es uno)', () => {
    expect(s.gastoSemana).toBe(0)
    expect(s.imprevistosTxs.map(t => t.monto)).toEqual([2_690_000, 422_787])
    expect(s.imprevistosReal).toBe(2_690_000 + 422_787)
  })

  it('sin reserva para imprevistos, la bici se come el día a día del mes: no queda presupuesto', () => {
    // día a día planeado 2.205.461 − imprevistos 3.112.787 − 100.000 gastados antes del lunes
    expect(s.presupuestoSemana).toBe(0)
    expect(s.quedaMes).toBeCloseTo(2_205_461 - 3_112_787 - 100_000)
    expect(s.mesFueraDelPlan).toBe(true)
  })

  it('lista lo que hay por revisar', () => {
    expect(s.porRevisar.map(r => r.tx.monto)).toEqual([400_000])
  })

  // Un plan que sí reserva para imprevistos: la bici cabe y queda día a día
  const holgado = { ingresoNetoMensual: 12_000_000, fijoTotalMonto: 4_920_000, ahorroMetaMonto: 2_500_000, imprevistosMonto: 3_200_000 }
  const diaPlan = 12_000_000 - 2_500_000 - 4_920_000 - 3_200_000 // 1.380.000
  const h = computeMonthSummary(txs, capas, holgado, '2026-10', '2026-10-06')

  it('con la reserva, lo que queda del mes se reparte en los 27 días que faltan', () => {
    expect(h.presupuestoSemana).toBeCloseTo((diaPlan - 100_000) * 7 / 27)
    expect(h.mesFueraDelPlan).toBe(false)
  })

  it('cada lunes es un nuevo comienzo: lo gastado de más antes se reparte en las semanas que quedan', () => {
    const conDerroche = [...txs, tx({ categoria: 'SALIDAS', monto: 270_000, fecha: '2026-10-03T23:00:00Z' })]
    const r = computeMonthSummary(conDerroche, capas, holgado, '2026-10', '2026-10-06')
    expect(r.presupuestoSemana).toBeCloseTo(h.presupuestoSemana - 270_000 * 7 / 27)
  })

  it('el mes se sale del plan cuando lo que queda no da ni para la mitad del ritmo', () => {
    // 700 mil en salidas chicas antes del lunes (una sola compra de 700 mil sería un imprevisto)
    const malMes = [...txs, ...[1, 2, 3, 4].map(() => tx({ categoria: 'SALIDAS', monto: 175_000, fecha: '2026-10-03T23:00:00Z' }))]
    expect(computeMonthSummary(malMes, capas, holgado, '2026-10', '2026-10-06').mesFueraDelPlan).toBe(true)
  })

  it('una semana partida entre dos meses solo cuenta sus días de este mes', () => {
    // jueves 1 de octubre: la semana va del lunes 28 sep al domingo 4 oct → 4 días en octubre
    const s1 = computeMonthSummary(txs, capas, holgado, '2026-10', '2026-10-01')
    expect(s1.presupuestoSemana).toBeCloseTo(diaPlan * 4 / 31)
  })

  it('un pago grande que se repite cada mes no es imprevisto', () => {
    // la compra de $423 mil es del comercio "Comercio"; si ese comercio se repite cada mes, es fijo de hecho
    const r = computeMonthSummary(txs, capas, plan, '2026-10', '2026-10-06', new Set(['com:comercio']))
    expect(r.imprevistosReal).toBe(2_690_000)
    expect(r.fijoReal).toBeGreaterThanOrEqual(2_910_000 + 422_787)
  })

  it('todo lo que cae en "Otro" es imprevisto, aunque sea chico', () => {
    const conOtro = [...txs, tx({ categoria: 'OTRO', comercio: 'Tienda nueva', monto: 45_000, fecha: '2026-10-05T18:00:00Z' })]
    const r = computeMonthSummary(conOtro, capas, plan, '2026-10', '2026-10-06')
    expect(r.imprevistosReal).toBe(s.imprevistosReal + 45_000)
    expect(r.gastoSemana).toBe(s.gastoSemana)
  })

  it('un "Otro" que se repite cada mes (la cuota del Fondo) es fijo, no imprevisto', () => {
    const fondo = tx({ categoria: 'OTRO', comercio: 'Fondo de Inversion', monto: 1_382_000 })
    const r = computeMonthSummary([...txs, fondo], capas, plan, '2026-10', '2026-10-06', new Set(['com:fondo de inversion']))
    expect(r.imprevistosReal).toBe(s.imprevistosReal)
    expect(r.fijoReal).toBe(s.fijoReal + 1_382_000)
  })

  it('un recibo (pago de servicio) nunca es imprevisto, aunque sea grande', () => {
    const conRecibo = [...txs, tx({ tipo: 'PAGO_SERVICIO', categoria: 'HOGAR', comercio: 'Acueducto', monto: 310_730 })]
    expect(computeMonthSummary(conRecibo, capas, plan, '2026-10', '2026-10-06').imprevistosReal).toBe(s.imprevistosReal)
  })

  it('sin plan no hay presupuesto, pero sí recibido y gastado', () => {
    const s0 = computeMonthSummary(txs, capas, null, '2026-10', '2026-10-06')
    expect(s0.presupuestoSemana).toBe(0)
    expect(s0.gastado).toBe(2_910_000 + 522_787 + 2_690_000)
  })

  it('sacar $700 mil de ahorros no agranda el presupuesto: baja tu ahorro y se ve como señal', () => {
    const conRetiro = [...txs, tx({ tipo: 'INGRESO', categoria: 'INGRESO', subcategoria: 'retiro_ahorros', monto: 700_000, fecha: '2026-10-06T03:37:00Z' })]
    const r = computeMonthSummary(conRetiro, capas, holgado, '2026-10', '2026-10-06')
    expect(r.presupuestoSemana).toBeCloseTo(h.presupuestoSemana)
    expect(r.recibido).toBe(h.recibido)
    expect(r.retiros).toBe(h.retiros + 700_000)
    expect(r.ahorroNeto).toBe(h.ahorroNeto - 700_000)
  })

  it('un mes pasado no tiene guía semanal', () => {
    const s3 = computeMonthSummary(txs, capas, plan, '2026-10', '2026-11-10')
    expect(s3.presupuestoSemana).toBe(0)
    expect(s3.gastoSemana).toBe(0)
  })
})

describe('armarChecklistFijos (plan real de octubre)', () => {
  const items = [
    { nombre: 'Arriendo', monto: 1_455_000 },
    { nombre: 'Aseo', monto: 180_000 },
    { nombre: 'Suscripciones', monto: 85_000 },
    { nombre: 'Gym', monto: 90_000 },
    { nombre: 'Deuda', monto: 710_000 },
  ]
  const fijoTxs = [
    tx({ id: 'arr', tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'HOGAR', comercio: 'Arriendo', monto: 2_910_000 }),
    tx({ id: 'aseo', tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'HOGAR', comercio: 'Aseo', monto: 120_000 }),
    tx({ id: 'anth', categoria: 'SUSCRIPCIONES', comercio: 'Anthropic Claude Team', monto: 424_457 }),
    tx({ id: 'acued', tipo: 'PAGO_SERVICIO', categoria: 'HOGAR', comercio: 'Acueducto', monto: 310_730 }),
  ]
  const c = armarChecklistFijos(items, fijoTxs, [])
  const item = (n: string) => c.items.find(i => i.nombre === n)!

  it('empareja por nombre cuando la categoría no coincide', () => {
    expect(item('Arriendo').pagado).toBe(2_910_000)
    expect(item('Aseo').txs.map(t => t.id)).toEqual(['aseo'])
  })

  it('empareja por categoría', () => {
    expect(item('Suscripciones').txs.map(t => t.id)).toEqual(['anth'])
  })

  it('marca estado y exceso', () => {
    expect(item('Arriendo').estado).toBe('pagado')
    expect(item('Arriendo').exceso).toBe(2_910_000 - 1_455_000)
    expect(item('Aseo').estado).toBe('parcial')
    expect(item('Gym').estado).toBe('pendiente')
    expect(c.pagados).toBe(2)
  })

  it('no chulea un ítem al que le falta plata, aunque sea poca', () => {
    const d = armarChecklistFijos(
      [{ nombre: 'Donaciones', monto: 500_000 }],
      [tx({ id: 'p', categoria: 'DONACIONES', monto: 250_000 }), tx({ id: 'a', categoria: 'DONACIONES', monto: 150_000 }), tx({ id: 'r', categoria: 'DONACIONES', monto: 70_000 })],
      []
    )
    expect(d.items[0].estado).toBe('parcial')
    expect(d.pendiente).toBe(30_000)
  })

  it('lo que falta pagar y los fijos sin ítem', () => {
    expect(c.pendiente).toBe(60_000 + 90_000 + 710_000)
    expect(c.sinItem.map(t => t.id)).toEqual(['acued'])
  })

  it('el resumen trae la lista cuando el plan tiene desglose', () => {
    const plan = { ingresoNetoMensual: 9_625_461, fijoTotalMonto: 2_520_000, ahorroMetaMonto: 0, fijoItems: items }
    // como en la app: qué es fijo sale del plan, y "Arriendo"/"Aseo" se emparejan por nombre
    const s = computeMonthSummary(fijoTxs, capasDelPlan(plan), plan, '2026-10', '2026-10-06')
    expect(s.fijos?.items).toHaveLength(5)
    expect(s.fijos?.pendiente).toBe(860_000)
  })
})

describe('pagosRecurrentesFueraDelPlan', () => {
  const prev = [
    tx({ mes_contable: '2026-08', categoria: 'OTRO', comercio: 'Renting Colombia', monto: 557_876, fecha: '2026-08-14T12:00:00Z' }),
    tx({ mes_contable: '2026-09', categoria: 'OTRO', comercio: 'Renting Colombia', monto: 557_876, fecha: '2026-09-14T12:00:00Z' }),
    tx({ mes_contable: '2026-08', categoria: 'SUSCRIPCIONES', comercio: 'Amazon Prime', monto: 24_900 }),
    tx({ mes_contable: '2026-09', categoria: 'SUSCRIPCIONES', comercio: 'Amazon Prime', monto: 24_900 }),
    ...[1, 2, 3, 4].map(i => tx({ id: `u8${i}`, mes_contable: '2026-08', categoria: 'TRANSPORTE', comercio: 'Uber', monto: 20_000 })),
    ...[1, 2, 3].map(i => tx({ id: `u9${i}`, mes_contable: '2026-09', categoria: 'TRANSPORTE', comercio: 'Uber Trip', monto: 20_000 })),
    tx({ mes_contable: '2026-09', categoria: 'OTRO', comercio: 'Klm Colombia Web', monto: 3_983_400 }),
  ]

  it('sugiere lo que se repite cada mes y no está en el plan', () => {
    expect(pagosRecurrentesFueraDelPlan(prev, {}, [])).toEqual([
      { nombre: 'Renting Colombia', monto: 557_876, meses: 2 },
      { nombre: 'Amazon Prime', monto: 24_900, meses: 2 },
    ])
  })

  it('no sugiere lo que ya cubre un ítem del plan (por categoría o nombre)', () => {
    const items = [{ nombre: 'Suscripciones', monto: 85_000 }, { nombre: 'Renting', monto: 560_000 }]
    expect(pagosRecurrentesFueraDelPlan(prev, {}, items)).toEqual([])
  })
})
