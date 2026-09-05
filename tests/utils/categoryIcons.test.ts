import { describe, it, expect } from 'vitest'
import { getCategoryIcon } from '@/lib/categoryIcons'
import { Dumbbell, Receipt, Utensils, Home, CircleEllipsis } from 'lucide-react'

describe('getCategoryIcon', () => {
  it('usa el ícono fijo para una categoría predefinida', () => {
    expect(getCategoryIcon('HOGAR')).toBe(Home)
  })

  it('adivina un ícono por palabra clave para categorías personalizadas conocidas', () => {
    expect(getCategoryIcon('DEPORTES')).toBe(Dumbbell)
    expect(getCategoryIcon('RECIBOS')).toBe(Receipt)
    expect(getCategoryIcon('RESTAURANTES')).toBe(Utensils)
  })

  it('cae al círculo genérico para un nombre sin ninguna palabra clave conocida', () => {
    expect(getCategoryIcon('MIS_GASTOS_RAROS')).toBe(CircleEllipsis)
  })
})
