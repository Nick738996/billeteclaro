import type { SupabaseClient } from '@supabase/supabase-js'

// Fake in-memory de Supabase para tests de servicios que encadenan varias
// tablas (monthly_plan, budgets, category_capas,
// transactions). Cubre solo las formas de query que estos servicios usan:
// select().eq()...maybeSingle()/single()/await-directo, insert().select().single(),
// update(patch).eq().eq()[.select()], delete().eq(), upsert(row, {onConflict}).

type Row = Record<string, unknown>
type Filter = ['eq' | 'gte' | 'lte', string, unknown]

function matchAll(row: Row, filters: Filter[]): boolean {
  return filters.every(([op, col, val]) => {
    if (op === 'eq') return row[col] === val
    if (op === 'gte') return (row[col] as string) >= (val as string)
    return (row[col] as string) <= (val as string)
  })
}

function randomId(): string {
  return `id-${Math.random().toString(36).slice(2)}`
}

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [table, rows] of Object.entries(seed)) tables[table] = rows.map(r => ({ ...r }))

  function selectBuilder(table: string, filters: Filter[] = []) {
    const builder = {
      eq: (col: string, val: unknown) => selectBuilder(table, [...filters, ['eq', col, val]]),
      gte: (col: string, val: unknown) => selectBuilder(table, [...filters, ['gte', col, val]]),
      lte: (col: string, val: unknown) => selectBuilder(table, [...filters, ['lte', col, val]]),
      order: () => builder,
      maybeSingle: async () => {
        const rows = (tables[table] ?? []).filter(r => matchAll(r, filters))
        return { data: rows[0] ?? null, error: null }
      },
      single: async () => {
        const rows = (tables[table] ?? []).filter(r => matchAll(r, filters))
        return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }
      },
      then: (resolve: (v: { data: Row[]; error: null }) => void, reject?: (e: unknown) => void) =>
        Promise.resolve({ data: (tables[table] ?? []).filter(r => matchAll(r, filters)), error: null }).then(
          resolve,
          reject
        ),
    }
    return builder
  }

  function eqChain(apply: (filters: [string, unknown][]) => Row[], filters: [string, unknown][] = []) {
    const chain = {
      eq: (col: string, val: unknown) => eqChain(apply, [...filters, [col, val]]),
      // update(...).eq(...).select() → filas afectadas
      select: (_cols?: string) => ({
        then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: apply(filters), error: null }),
      }),
      then: (resolve: (v: { error: null }) => void) => {
        apply(filters)
        resolve({ error: null })
      },
    }
    return chain
  }

  function from(table: string) {
    return {
      select: (_cols?: string) => selectBuilder(table),
      insert: (row: Row) => {
        const inserted = { id: (row.id as string) ?? randomId(), ...row }
        tables[table] = [...(tables[table] ?? []), inserted]
        return { select: () => ({ single: async () => ({ data: inserted, error: null }) }) }
      },
      update: (patch: Row) =>
        eqChain(filters => {
          const affected: Row[] = []
          tables[table] = (tables[table] ?? []).map(r => {
            if (!filters.every(([c, v]) => r[c] === v)) return r
            const next = { ...r, ...patch }
            affected.push(next)
            return next
          })
          return affected
        }),
      delete: () =>
        eqChain(filters => {
          const removed = (tables[table] ?? []).filter(r => filters.every(([c, v]) => r[c] === v))
          tables[table] = (tables[table] ?? []).filter(r => !filters.every(([c, v]) => r[c] === v))
          return removed
        }),
      upsert: async (row: Row, opts?: { onConflict?: string }) => {
        const conflictCols = opts?.onConflict?.split(',') ?? ['id']
        const idx = (tables[table] ?? []).findIndex(existing => conflictCols.every(c => existing[c] === row[c]))
        if (idx >= 0) tables[table][idx] = { ...tables[table][idx], ...row }
        else tables[table] = [...(tables[table] ?? []), { id: randomId(), ...row }]
        return { data: null, error: null }
      },
    }
  }

  return { supabase: { from } as unknown as SupabaseClient, tables }
}
