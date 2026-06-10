import { describe, it, expect } from 'vitest'
import { guessCategoria } from '../../lib/parsers/commerceCategories'

describe('guessCategoria', () => {
  it('classifies Uber as TRANSPORTE', () => {
    expect(guessCategoria('Uber')).toBe('TRANSPORTE')
    expect(guessCategoria('UBER TRIP')).toBe('TRANSPORTE')
  })

  it('classifies Rappi as SALIDAS (not TRANSPORTE)', () => {
    // SALIDAS must match before TRANSPORTE so 'rappi' doesn't fall into TRANSPORTE
    expect(guessCategoria('Rappi')).toBe('SALIDAS')
    expect(guessCategoria('rappi (app)')).toBe('SALIDAS')
  })

  it('classifies Netflix as SUSCRIPCIONES', () => {
    expect(guessCategoria('Netflix')).toBe('SUSCRIPCIONES')
  })

  it('classifies Éxito as HOGAR', () => {
    expect(guessCategoria('Éxito')).toBe('HOGAR')
    expect(guessCategoria('Exito')).toBe('HOGAR')
  })

  it('classifies Juan Valdez as SALIDAS', () => {
    expect(guessCategoria('Juan Valdez')).toBe('SALIDAS')
  })

  it('classifies BodyTech as SALUD', () => {
    expect(guessCategoria('BodyTech')).toBe('SALUD')
    expect(guessCategoria('bodytech gym')).toBe('SALUD')
  })

  it('classifies Platzi as EDUCACION', () => {
    expect(guessCategoria('Platzi')).toBe('EDUCACION')
  })

  it('classifies Mercado Libre as COMPRAS_ONLINE', () => {
    expect(guessCategoria('Mercado Libre')).toBe('COMPRAS_ONLINE')
  })

  it('returns OTRO for unknown commerce', () => {
    expect(guessCategoria('Tienda Random XYZ')).toBe('OTRO')
    expect(guessCategoria('Bancolombia')).toBe('OTRO')
    expect(guessCategoria('')).toBe('OTRO')
  })

  it('is case-insensitive', () => {
    expect(guessCategoria('SPOTIFY')).toBe('SUSCRIPCIONES')
    expect(guessCategoria('spotify')).toBe('SUSCRIPCIONES')
    expect(guessCategoria('Spotify')).toBe('SUSCRIPCIONES')
  })
})
