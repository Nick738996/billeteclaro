import { describe, it, expect } from 'vitest'
import { categoriaDeItem, categoriasDelPlan, categoriasPorRegistrar, capasDelPlan } from '@/lib/services/planCategories'

describe('categoriaDeItem', () => {
  it('reusa la categoría predeterminada si el nombre coincide', () => {
    expect(categoriaDeItem('Suscripciones')).toBe('SUSCRIPCIONES')
    expect(categoriaDeItem('Inversion')).toBe('INVERSION')
    expect(categoriaDeItem('Inversión')).toBe('INVERSION')
    expect(categoriaDeItem('Compras Online')).toBe('COMPRAS_ONLINE')
  })

  it('crea una clave nueva para lo demás', () => {
    expect(categoriaDeItem('Arriendo')).toBe('ARRIENDO')
    expect(categoriaDeItem(' Gym ')).toBe('GYM')
    expect(categoriaDeItem('Plan de celular')).toBe('PLAN_DE_CELULAR')
  })
})

describe('categoriasDelPlan (plan real de octubre)', () => {
  const plan = {
    fijoItems: [
      { nombre: 'Arriendo', monto: 1_455_000 }, { nombre: 'Aseo', monto: 180_000 },
      { nombre: 'Recibos', monto: 200_000 }, { nombre: 'Suscripciones', monto: 85_000 },
      { nombre: 'Gym', monto: 90_000 }, { nombre: 'Inversion', monto: 1_000_000 },
    ],
    ahorroItems: [{ nombre: 'Viaje', monto: 500_000 }],
  }

  it('toma la capa de la sección donde está el ítem', () => {
    const cats = categoriasDelPlan(plan)
    expect(cats.find(c => c.categoria === 'ARRIENDO')?.capa).toBe('FIJO')
    expect(cats.find(c => c.categoria === 'VIAJE')?.capa).toBe('AHORRO')
  })

  it('solo registra las nuevas: ni predeterminadas ni las que ya tienen capa', () => {
    const nuevas = categoriasPorRegistrar(categoriasDelPlan(plan), { RECIBOS: 'FIJO' })
    expect(nuevas.map(c => c.categoria)).toEqual(['ARRIENDO', 'ASEO', 'GYM', 'VIAJE'])
  })

  it('sin plan no hay categorías', () => {
    expect(categoriasDelPlan(null)).toEqual([])
  })
})

describe('capasDelPlan', () => {
  it('los ítems de fijos del plan son la única fuente de lo fijo', () => {
    const capas = capasDelPlan({ fijoItems: [{ nombre: 'Arriendo', monto: 1 }, { nombre: 'Suscripciones', monto: 1 }], ahorroItems: [{ nombre: 'Viaje', monto: 1 }] })
    expect(capas).toEqual({ ARRIENDO: 'FIJO', SUSCRIPCIONES: 'FIJO', VIAJE: 'AHORRO' })
  })

  it('un ítem "Inversión" o "Préstamo" en fijos no vuelve gasto tus aportes ni tus préstamos', () => {
    const capas = capasDelPlan({ fijoItems: [{ nombre: 'Inversion', monto: 1 }, { nombre: 'Préstamo', monto: 1 }] })
    expect(capas).toEqual({})
  })
})
