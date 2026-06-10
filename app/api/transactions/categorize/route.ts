import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import type { Categoria } from '@/lib/types'

// PATCH /api/transactions/categorize  body: { changes: [{id, categoria}] }
export async function PATCH(request: Request) {
  const { user, supabase } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { changes } = await request.json() as { changes: { id: string; categoria: Categoria }[] }
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: 'changes requeridos' }, { status: 400 })
  }

  const results = await Promise.all(
    changes.map(({ id, categoria }) =>
      supabase
        .from('transactions')
        .update({ categoria })
        .eq('id', id)
        .eq('user_id', user.id)
    )
  )

  const failed = results.filter(r => r.error)
  if (failed.length > 0) {
    return NextResponse.json({ error: 'Algunos cambios fallaron', count: failed.length }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: changes.length })
}
