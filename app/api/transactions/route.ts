import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { startOfMonth, endOfMonth, parseISO } from 'date-fns'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month') // YYYY-MM

  let start: Date
  let end: Date

  if (monthParam) {
    const ref = parseISO(`${monthParam}-01`)
    start = startOfMonth(ref)
    end = endOfMonth(ref)
  } else {
    const now = new Date()
    start = startOfMonth(now)
    end = endOfMonth(now)
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .gte('fecha', start.toISOString())
    .lte('fecha', end.toISOString())
    .order('fecha', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, categoria, subcategoria, comercio } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (categoria) updates.categoria = categoria
  if (subcategoria !== undefined) updates.subcategoria = subcategoria
  if (comercio !== undefined) updates.comercio = comercio

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('transactions')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
