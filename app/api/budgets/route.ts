import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import type { Categoria, BudgetEntry, BudgetSubcat } from '@/lib/types'

// GET /api/budgets?mes=YYYY-MM
export async function GET(request: Request) {
  const { user, supabase } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const mes = url.searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)

  const { data, error } = await supabase
    .from('budgets')
    .select('categoria, monto_presupuestado, subcategorias')
    .eq('user_id', user.id)
    .eq('mes', mes)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const budgets: Record<string, BudgetEntry> = {}
  for (const row of data ?? []) {
    budgets[row.categoria] = {
      monto: Number(row.monto_presupuestado),
      subcategorias: (row.subcategorias as BudgetSubcat[]) ?? [],
    }
  }
  return NextResponse.json({ mes, budgets })
}

// PUT /api/budgets  body: { mes, items: [{ categoria, monto, subcategorias }] }
export async function PUT(request: Request) {
  const { user, supabase } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    mes: string
    items: { categoria: Categoria; monto: number; subcategorias: BudgetSubcat[] }[]
  }
  const { mes, items } = body

  if (!mes || !Array.isArray(items)) {
    return NextResponse.json({ error: 'mes e items son requeridos' }, { status: 400 })
  }

  const toDelete = items.filter(i => i.monto === 0).map(i => i.categoria)
  const toUpsert = items
    .filter(i => i.monto > 0)
    .map(i => ({
      user_id: user.id,
      mes,
      categoria: i.categoria,
      monto_presupuestado: i.monto,
      subcategorias: i.subcategorias,
    }))

  if (toDelete.length > 0) {
    await supabase.from('budgets').delete()
      .eq('user_id', user.id).eq('mes', mes).in('categoria', toDelete)
  }
  if (toUpsert.length > 0) {
    const { error } = await supabase.from('budgets')
      .upsert(toUpsert, { onConflict: 'user_id,mes,categoria' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
