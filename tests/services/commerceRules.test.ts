import { describe, it, expect } from 'vitest'
import {
  normalizeComercio,
  ruleKey,
  categoriaPorRegla,
  learnCategoryRule,
  getCommerceRules,
  deleteRulesForCategoria,
} from '@/lib/services/commerceRules'
import type { Transaction } from '@/lib/types'
import { createFakeSupabase } from '../helpers/fakeSupabase'

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1', user_id: 'u1', gmail_message_id: 'm1', fecha: '2026-10-02T17:00:00Z', monto: 10_000,
    comercio: 'Comercio', descripcion: null, banco: 'RAPPICARD', tipo: 'COMPRA', categoria: 'OTRO',
    subcategoria: null, id_auditoria: null, moneda: 'COP', monto_usd: null, flags: [], raw_snippet: null,
    procesado: true, mes_contable: '2026-10', es_sueldo: false, created_at: '2026-10-02T17:00:00Z',
    contraparte_id: null, capa_override: null,
    ...overrides,
  }
}

describe('normalizeComercio', () => {
  it('quita mayúsculas, tildes, ruido del banco y números', () => {
    expect(normalizeComercio('Uber Trip')).toBe('uber')
    expect(normalizeComercio('Uber Rides')).toBe('uber')
    expect(normalizeComercio('Oxxo Contador Bogota Co')).toBe('oxxo contador')
    expect(normalizeComercio('Café Soca Maz')).toBe('cafe soca maz')
    expect(normalizeComercio('Amazon Prime 6158284 Co')).toBe('amazon prime')
    expect(normalizeComercio(null)).toBe('')
  })
})

describe('ruleKey', () => {
  it('compras por comercio, transferencias por cuenta destino', () => {
    expect(ruleKey(tx({ comercio: 'Combo Padel Club' }))).toBe('com:combo padel club')
    expect(ruleKey(tx({ tipo: 'TRANSFERENCIA_ENVIADA', comercio: 'Arriendo', contraparte_id: 'carlosfdezmo@me.com' }))).toBe('cta:carlosfdezmo@me.com')
  })

  it('no aprende de entradas, pagos de tarjeta, bolsillos ni transferencias sin cuenta', () => {
    expect(ruleKey(tx({ tipo: 'TRANSFERENCIA_RECIBIDA', comercio: 'Bancolombia' }))).toBeNull()
    expect(ruleKey(tx({ tipo: 'ABONO_DEUDA', comercio: 'RappiCard' }))).toBeNull()
    expect(ruleKey(tx({ tipo: 'TRANSFERENCIA_ENVIADA', subcategoria: 'aporte_ahorros', contraparte_id: 'x' }))).toBeNull()
    expect(ruleKey(tx({ tipo: 'TRANSFERENCIA_ENVIADA', comercio: 'Abuelo', contraparte_id: null }))).toBeNull()
  })
})

describe('learnCategoryRule', () => {
  it('guarda la regla y corrige los parecidos del mismo mes (caso Combo Padel)', async () => {
    const { supabase, tables } = createFakeSupabase({
      commerce_rules: [],
      transactions: [
        { ...tx({ id: 'a', comercio: 'Combo Padel Club', categoria: 'DEPORTES' }) },
        { ...tx({ id: 'b', comercio: 'Combo Padel Club', categoria: 'OTRO' }) },
        { ...tx({ id: 'c', comercio: 'COMBO PADEL CLUB', categoria: 'SALIDAS' }) },
        { ...tx({ id: 'd', comercio: 'Combo Padel Club', categoria: 'SALIDAS', mes_contable: '2026-09' }) },
        { ...tx({ id: 'e', comercio: 'Juan Valdez', categoria: 'SALIDAS' }) },
      ],
    })
    const cambiado = tables.transactions[0] as unknown as Transaction
    const n = await learnCategoryRule(supabase, 'u1', cambiado)

    expect(n).toBe(2)
    expect(tables.transactions.map(t => t.categoria)).toEqual(['DEPORTES', 'DEPORTES', 'DEPORTES', 'SALIDAS', 'SALIDAS'])
    const rules = await getCommerceRules(supabase, 'u1')
    expect(categoriaPorRegla(tx({ comercio: 'Combo Padel Club' }), rules)).toBe('DEPORTES')
    expect(categoriaPorRegla(tx({ comercio: 'Juan Valdez' }), rules)).toBeNull()
  })

  it('cambiar de nuevo actualiza la regla', async () => {
    const { supabase } = createFakeSupabase({ commerce_rules: [], transactions: [] })
    await learnCategoryRule(supabase, 'u1', tx({ comercio: 'Wuufu', categoria: 'SALUD' }))
    await learnCategoryRule(supabase, 'u1', tx({ comercio: 'Wuufu', categoria: 'MASCOTAS' }))
    const rules = await getCommerceRules(supabase, 'u1')
    expect(categoriaPorRegla(tx({ comercio: 'Merpago Wuufu' }), rules)).toBeNull()
    expect(categoriaPorRegla(tx({ comercio: 'Wuufu' }), rules)).toBe('MASCOTAS')
  })

  it('eliminar una categoría borra sus reglas', async () => {
    const { supabase } = createFakeSupabase({ commerce_rules: [], transactions: [] })
    await learnCategoryRule(supabase, 'u1', tx({ comercio: 'Wuufu', categoria: 'MASCOTAS' }))
    await deleteRulesForCategoria(supabase, 'u1', 'MASCOTAS')
    expect((await getCommerceRules(supabase, 'u1')).size).toBe(0)
  })
})
