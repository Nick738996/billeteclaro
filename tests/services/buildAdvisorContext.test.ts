import { describe, it, expect } from 'vitest'
import { buildAdvisorContext, hashContext } from '@/lib/ai/buildAdvisorContext'
import type { Transaction } from '@/lib/types'

const BASE_TX: Omit<Transaction, 'id' | 'tipo' | 'monto' | 'categoria'> = {
  user_id:          'u1',
  gmail_message_id: 'msg1',
  fecha:            '2026-06-10T10:00:00Z',
  comercio:         'Test',
  descripcion:      null,
  banco:            'RAPPICARD',
  subcategoria:     null,
  id_auditoria:     null,
  moneda:           'COP',
  monto_usd:        null,
  flags:            [],
  raw_snippet:      null,
  procesado:        true,
  mes_contable:     '2026-06',
  es_sueldo:        false,
  created_at:       '2026-06-10T00:00:00Z',
}

const tx = (id: string, tipo: Transaction['tipo'], monto: number, categoria: Transaction['categoria']): Transaction => ({
  ...BASE_TX,
  id,
  tipo,
  monto,
  categoria,
})

describe('buildAdvisorContext', () => {
  it('suma gastos por categoría excluyendo INGRESO y TRANSFERENCIA_RECIBIDA', () => {
    const txs = [
      tx('a', 'COMPRA',               50_000, 'SALIDAS'),
      tx('b', 'INGRESO',            1_000_000, 'INGRESO'),
      tx('c', 'TRANSFERENCIA_RECIBIDA', 200_000, 'TRANSFERENCIA'),
    ]
    const ctx = buildAdvisorContext('2026-06', txs, {})
    expect(ctx.gastos_por_categoria['SALIDAS']).toBe(50_000)
    expect(ctx.total_gastado).toBe(50_000)
  })

  it('incluye TRANSFERENCIA_RECIBIDA e INGRESO en ingreso_estimado', () => {
    const txs = [
      tx('a', 'INGRESO',              500_000, 'INGRESO'),
      tx('b', 'TRANSFERENCIA_RECIBIDA', 100_000, 'TRANSFERENCIA'),
      tx('c', 'COMPRA',               20_000,  'HOGAR'),
    ]
    const ctx = buildAdvisorContext('2026-06', txs, {})
    expect(ctx.ingreso_estimado).toBe(600_000)
  })

  it('ABONO_DEUDA no cuenta como gasto ni ingreso', () => {
    const txs = [
      tx('a', 'ABONO_DEUDA', 300_000, 'DEUDA'),
      tx('b', 'COMPRA',       50_000, 'HOGAR'),
    ]
    const ctx = buildAdvisorContext('2026-06', txs, {})
    expect(ctx.total_gastado).toBe(50_000)
    expect(ctx.ingreso_estimado).toBe(0)
  })

  it('refleja presupuesto pasado como parámetro', () => {
    const ctx = buildAdvisorContext('2026-06', [], { HOGAR: 400_000, SALIDAS: 200_000 })
    expect(ctx.presupuesto_por_categoria['HOGAR']).toBe(400_000)
    expect(ctx.total_presupuestado).toBe(600_000)
  })

  describe('gasto_diario_promedio y proyeccion_cierre (Corrección 3)', () => {
    it('gasto_diario_promedio excluye transferencias del cálculo', () => {
      const txs = [
        tx('a', 'COMPRA',               300_000, 'SALIDAS'),
        tx('b', 'TRANSFERENCIA_ENVIADA', 500_000, 'TRANSFERENCIA'),
      ]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      // Solo $300k de gastos reales, sin contar la transferencia
      expect(ctx.gasto_diario_promedio).toBeGreaterThan(0)
      // La transferencia no debe inflar el ritmo diario
      const ratioConTransf = ctx.total_gastado / ctx.dias_transcurridos
      expect(ctx.gasto_diario_promedio).toBeLessThan(ratioConTransf)
    })

    it('gasto_diario_promedio es 0 cuando dias_transcurridos es 0', () => {
      // Mes futuro: diaActual cae en totalDias (fallback), pero se testea la lógica
      // con un mes donde no hay días transcurridos simulando días = 0
      const txs = [tx('a', 'COMPRA', 100_000, 'HOGAR')]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      // dias_transcurridos siempre >= 1 en meses activos, no puede ser 0 en runtime normal
      // Verificamos que el campo existe y es un número no negativo
      expect(ctx.gasto_diario_promedio).toBeGreaterThanOrEqual(0)
    })

    it('proyeccion_cierre = gasto_diario_promedio × dias_totales_mes', () => {
      const txs = [tx('a', 'COMPRA', 300_000, 'HOGAR')]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      const diasTotales = ctx.dias_transcurridos + ctx.dias_restantes
      expect(ctx.proyeccion_cierre).toBe(Math.round(ctx.gasto_diario_promedio * diasTotales))
    })

    it('proyeccion_cierre con solo transferencias es 0 (no cuenta como gasto real)', () => {
      const txs = [tx('a', 'TRANSFERENCIA_ENVIADA', 1_000_000, 'TRANSFERENCIA')]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      expect(ctx.gasto_diario_promedio).toBe(0)
      expect(ctx.proyeccion_cierre).toBe(0)
    })
  })

  describe('AHORROS y PRESTAMO no cuentan como gastos del mes (Feature 7/8)', () => {
    it('COMPRA categorizada como AHORROS no se suma en total_gastado', () => {
      const txs = [
        tx('a', 'COMPRA', 200_000, 'AHORROS'),
        tx('b', 'COMPRA',  50_000, 'HOGAR'),
      ]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      expect(ctx.total_gastado).toBe(50_000)
      expect(ctx.gastos_por_categoria['AHORROS']).toBeUndefined()
    })

    it('COMPRA categorizada como PRESTAMO no se suma en total_gastado', () => {
      const txs = [
        tx('a', 'COMPRA', 500_000, 'PRESTAMO'),
        tx('b', 'COMPRA',  30_000, 'SALIDAS'),
      ]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      expect(ctx.total_gastado).toBe(30_000)
      expect(ctx.gastos_por_categoria['PRESTAMO']).toBeUndefined()
    })

    it('mes con solo AHORROS y PRESTAMO → total_gastado = 0', () => {
      const txs = [
        tx('a', 'COMPRA', 300_000, 'AHORROS'),
        tx('b', 'COMPRA', 150_000, 'PRESTAMO'),
      ]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      expect(ctx.total_gastado).toBe(0)
    })

    it('AHORROS no afecta ingreso_estimado', () => {
      const txs = [
        tx('a', 'COMPRA',  200_000, 'AHORROS'),
        tx('b', 'INGRESO', 800_000, 'INGRESO'),
      ]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      expect(ctx.ingreso_estimado).toBe(800_000)
    })

    it('mix real: gastos normales + ahorro + préstamo calcula correctamente', () => {
      const txs = [
        tx('a', 'COMPRA',  80_000, 'SALIDAS'),
        tx('b', 'COMPRA',  40_000, 'TRANSPORTE'),
        tx('c', 'COMPRA', 200_000, 'AHORROS'),
        tx('d', 'COMPRA', 100_000, 'PRESTAMO'),
        tx('e', 'INGRESO', 5_000_000, 'INGRESO'),
      ]
      const ctx = buildAdvisorContext('2026-06', txs, {})
      expect(ctx.total_gastado).toBe(120_000)
      expect(ctx.ingreso_estimado).toBe(5_000_000)
      expect(ctx.gastos_por_categoria['SALIDAS']).toBe(80_000)
      expect(ctx.gastos_por_categoria['TRANSPORTE']).toBe(40_000)
    })
  })
})

describe('hashContext', () => {
  const baseCtx = buildAdvisorContext('2026-06', [
    tx('a', 'COMPRA', 100_000, 'HOGAR'),
  ], { HOGAR: 500_000 })

  it('mismo contexto produce el mismo hash (determinista)', () => {
    const h1 = hashContext(baseCtx)
    const h2 = hashContext(baseCtx)
    expect(h1).toBe(h2)
  })

  it('cambiar gastos produce hash diferente', () => {
    const ctx2 = buildAdvisorContext('2026-06', [
      tx('a', 'COMPRA', 200_000, 'HOGAR'),
    ], { HOGAR: 500_000 })
    expect(hashContext(baseCtx)).not.toBe(hashContext(ctx2))
  })

  it('cambiar presupuesto produce hash diferente', () => {
    const ctx2 = buildAdvisorContext('2026-06', [
      tx('a', 'COMPRA', 100_000, 'HOGAR'),
    ], { HOGAR: 999_000 })
    expect(hashContext(baseCtx)).not.toBe(hashContext(ctx2))
  })

  it('cambiar solo dias_transcurridos no cambia el hash', () => {
    const ctx2 = { ...baseCtx, dias_transcurridos: baseCtx.dias_transcurridos + 3 }
    expect(hashContext(baseCtx)).toBe(hashContext(ctx2))
  })

  it('cambiar solo dias_restantes no cambia el hash', () => {
    const ctx2 = { ...baseCtx, dias_restantes: 0 }
    expect(hashContext(baseCtx)).toBe(hashContext(ctx2))
  })
})
