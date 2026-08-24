import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transaction } from '@/lib/types'
import {
  normalizeIdentificador,
  maskIdentificador,
  applyContraparteDisplay,
  getContactAliases,
  upsertContactAlias,
} from '@/lib/services/contactAliasService'

function makeSelectSupabase(data: unknown[] | null, error: { message: string } | null = null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data, error }),
      }),
    }),
  } as unknown as SupabaseClient
}

function makeUpsertSupabase(data: unknown | null, error: { message: string } | null = null): SupabaseClient {
  return {
    from: () => ({
      upsert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

const baseTx: Transaction = {
  id: 't1', user_id: 'u1', gmail_message_id: 'm1',
  fecha: '2026-06-07T13:07:00.000Z', monto: 120000,
  comercio: null, descripcion: 'Transferencia enviada',
  banco: 'BANCOLOMBIA', tipo: 'TRANSFERENCIA_ENVIADA', categoria: 'TRANSFERENCIA',
  subcategoria: null, id_auditoria: '0607-01', moneda: 'COP', monto_usd: null,
  flags: [], raw_snippet: null, procesado: true, mes_contable: '2026-06',
  es_sueldo: false, created_at: '2026-06-07T13:07:00.000Z', contraparte_id: null,
}

describe('normalizeIdentificador', () => {
  it('recorta espacios y pasa a minúsculas', () => {
    expect(normalizeIdentificador('  @JuanPerez ')).toBe('@juanperez')
  })
})

describe('maskIdentificador', () => {
  it('enmascara identificadores numéricos dejando los últimos 4 dígitos', () => {
    expect(maskIdentificador('3232989410')).toBe('****9410')
  })

  it('deja tal cual identificadores no numéricos (handles/llaves cortas)', () => {
    expect(maskIdentificador('@juanperez')).toBe('@juanperez')
  })
})

describe('applyContraparteDisplay', () => {
  it('no modifica la transacción si no tiene contraparte_id', () => {
    const t = { ...baseTx, contraparte_id: null }
    expect(applyContraparteDisplay(t, new Map())).toBe(t)
  })

  it('usa el alias del usuario cuando existe (normalizado)', () => {
    const t = { ...baseTx, contraparte_id: '3001234567' }
    const aliasMap = new Map([['3001234567', 'Mamá']])
    expect(applyContraparteDisplay(t, aliasMap).comercio).toBe('Mamá')
  })

  it('cae al fallback enmascarado cuando no hay alias', () => {
    const t = { ...baseTx, contraparte_id: '3232989410' }
    expect(applyContraparteDisplay(t, new Map()).comercio).toBe('****9410')
  })

  it('no persiste el cambio en el objeto original (sólo devuelve uno nuevo)', () => {
    const t = { ...baseTx, contraparte_id: '3232989410' }
    applyContraparteDisplay(t, new Map([['3232989410', 'Casero']]))
    expect(t.comercio).toBeNull()
  })
})

describe('getContactAliases', () => {
  it('devuelve la lista de alias del usuario', async () => {
    const supabase = makeSelectSupabase([{ id: 'a1', identificador: '3001234567', nombre: 'Mamá' }])
    const result = await getContactAliases(supabase, 'user-1')
    expect(result).toEqual([{ id: 'a1', identificador: '3001234567', nombre: 'Mamá' }])
  })

  it('devuelve [] si no hay alias', async () => {
    const supabase = makeSelectSupabase(null)
    const result = await getContactAliases(supabase, 'user-1')
    expect(result).toEqual([])
  })

  it('lanza error si Supabase falla', async () => {
    const supabase = makeSelectSupabase(null, { message: 'connection timeout' })
    await expect(getContactAliases(supabase, 'user-1')).rejects.toThrow('connection timeout')
  })
})

describe('upsertContactAlias', () => {
  it('normaliza el identificador y recorta el nombre antes de guardar', async () => {
    const supabase = makeUpsertSupabase({ id: 'a1', identificador: '@juanperez', nombre: 'Juan' })
    const result = await upsertContactAlias(supabase, 'user-1', ' @JuanPerez ', '  Juan  ')
    expect(result).toEqual({ id: 'a1', identificador: '@juanperez', nombre: 'Juan' })
  })

  it('lanza error si Supabase falla', async () => {
    const supabase = makeUpsertSupabase(null, { message: 'violates row-level security policy' })
    await expect(upsertContactAlias(supabase, 'user-1', '@juanperez', 'Juan')).rejects.toThrow(
      'violates row-level security policy'
    )
  })
})
