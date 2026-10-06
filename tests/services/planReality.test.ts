import { describe, it, expect } from 'vitest'
import { historialPlan, diaADiaDelPlan } from '@/lib/services/planReality'
import type { Transaction } from '@/lib/types'

let n = 0
function tx(o: Partial<Transaction>): Transaction {
  return {
    id: `t${++n}`, user_id: 'u1', gmail_message_id: `m${n}`, fecha: '2026-08-10T15:00:00Z', monto: 10_000,
    comercio: `Comercio ${n}`, descripcion: null, banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'SALIDAS',
    subcategoria: null, id_auditoria: null, moneda: 'COP', monto_usd: null, flags: [], raw_snippet: null,
    procesado: true, mes_contable: '2026-08', es_sueldo: false, created_at: '', contraparte_id: null, capa_override: null,
    ...o,
  }
}

describe('historialPlan', () => {
  const txs = [
    // fijos
    ...['2026-07', '2026-08', '2026-09'].map(m => tx({ mes_contable: m, categoria: 'HOGAR', tipo: 'TRANSFERENCIA_ENVIADA', contraparte_id: 'arriendo', monto: 2_910_000 })),
    // pago mensual mal categorizado como Otro: cuenta como fijo por repetirse
    ...['2026-07', '2026-08'].map(m => tx({ mes_contable: m, categoria: 'OTRO', comercio: 'Fondo de Inversion', monto: 1_382_000 })),
    // día a día: muchas compras chicas (Rappi varias veces al mes no es "recurrente")
    ...Array.from({ length: 12 }, () => tx({ mes_contable: '2026-07', comercio: 'Rappi', monto: 250_000 })),
    ...Array.from({ length: 14 }, () => tx({ mes_contable: '2026-08', comercio: 'Rappi', monto: 250_000 })),
    ...Array.from({ length: 10 }, () => tx({ mes_contable: '2026-09', comercio: 'Rappi', monto: 250_000 })),
    // imprevistos: grandes que no se repiten
    tx({ mes_contable: '2026-08', categoria: 'OTRO', comercio: 'Klm Colombia Web', monto: 3_983_400 }),
    tx({ mes_contable: '2026-09', categoria: 'OTRO', comercio: 'Hilton', monto: 478_000 }),
    // ingreso
    ...['2026-07', '2026-08', '2026-09'].map(m => tx({ mes_contable: m, tipo: 'INGRESO', categoria: 'INGRESO', monto: 9_600_000 })),
  ]
  const h = historialPlan(txs, {})!

  it('separa fijos (incluye lo que se repite), día a día e imprevistos por mes', () => {
    const ago = h.meses.find(m => m.mes === '2026-08')!
    expect(ago.fijos).toBe(2_910_000 + 1_382_000)
    expect(ago.diaADia).toBe(3_500_000)
    expect(ago.imprevistos).toBe(3_983_400)
  })

  it('el mes normal usa la mediana: un vuelo no infla los imprevistos', () => {
    expect(h.mesNormal.imprevistos).toBe(478_000)
    expect(h.mesNormal.diaADia).toBe(3_000_000)
    expect(h.mesNormal.recibido).toBe(9_600_000)
    expect(h.imprevistosTxs[0].comercio).toBe('Klm Colombia Web')
  })

  it('lo que cae en "Otro" cuenta como imprevisto en el mes normal, no como día a día', () => {
    const conOtro = historialPlan([...txs, tx({ mes_contable: '2026-09', categoria: 'OTRO', comercio: 'Tienda', monto: 50_000 })], {})!
    const sep = conOtro.meses.find(m => m.mes === '2026-09')!
    expect(sep.imprevistos).toBe(478_000 + 50_000)
    expect(sep.diaADia).toBe(2_500_000)
  })

  it('sin gastos no hay historial', () => {
    expect(historialPlan([], {})).toBeNull()
  })
})

describe('diaADiaDelPlan (págate primero)', () => {
  it('el día a día es lo que queda después de ahorrar, fijos e imprevistos', () => {
    // octubre: ahorro 10% primero, fijos sin la cuota del apartamento, imprevistos normales
    expect(diaADiaDelPlan({ ingreso: 9_625_461, ahorro: 960_000, fijos: 4_620_000, imprevistos: 1_630_000 })).toBe(2_415_461)
  })

  it('negativo cuando el plan no cabe en lo que entra', () => {
    expect(diaADiaDelPlan({ ingreso: 9_625_461, ahorro: 2_500_000, fijos: 6_000_000, imprevistos: 1_600_000 })).toBe(-474_539)
  })
})
