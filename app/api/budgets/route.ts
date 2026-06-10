import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Categoria } from '@/lib/types'

// GET /api/budgets?mes=YYYY-MM
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const mes = url.searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)

  const { data, error } = await supabase
    .from('budgets')
    .select('categoria, monto_presupuestado')
    .eq('user_id', user.id)
    .eq('mes', mes)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    map[row.categoria] = Number(row.monto_presupuestado)
  }
  return NextResponse.json({ mes, budgets: map })
}

// PUT /api/budgets  body: { mes, categoria, monto }
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { mes: string; categoria: Categoria; monto: number }
  const { mes, categoria, monto } = body

  if (!mes || !categoria || monto === undefined) {
    return NextResponse.json({ error: 'mes, categoria y monto son requeridos' }, { status: 400 })
  }

  const { error } = await supabase
    .from('budgets')
    .upsert(
      { user_id: user.id, mes, categoria, monto_presupuestado: monto },
      { onConflict: 'user_id,mes,categoria' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
