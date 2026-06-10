import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import type { Categoria, Banco, TipoTransaccion } from '@/lib/types'

interface ManualTx {
  fecha: string        // ISO date string
  monto: number
  comercio: string
  categoria: Categoria
  tipo: TipoTransaccion
  banco: Banco
}

async function generateAuditId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  fecha: Date
): Promise<string> {
  const dayStart = new Date(fecha); dayStart.setHours(0, 0, 0, 0)
  const dayEnd   = new Date(fecha); dayEnd.setHours(23, 59, 59, 999)
  const { count } = await admin
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('fecha', dayStart.toISOString())
    .lte('fecha', dayEnd.toISOString())
  const seq  = ((count ?? 0) + 1).toString().padStart(2, '0')
  const mmdd = format(fecha, 'MMdd')
  return `${mmdd}-${seq}`
}

// POST /api/transactions/manual  body: { items: ManualTx[] }
export async function POST(request: Request) {
  const supabase = await createClient()
  const admin    = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { items } = await request.json() as { items: ManualTx[] }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items requeridos' }, { status: 400 })
  }

  const rows = await Promise.all(items.map(async (tx) => {
    const fecha = new Date(tx.fecha)
    const auditId = await generateAuditId(admin, user.id, fecha)
    return {
      user_id:         user.id,
      gmail_message_id:`manual_${crypto.randomUUID()}`,
      fecha:           fecha.toISOString(),
      monto:           tx.monto,
      comercio:        tx.comercio || null,
      descripcion:     tx.comercio || null,
      banco:           tx.banco,
      tipo:            tx.tipo,
      categoria:       tx.categoria,
      id_auditoria:    auditId,
      procesado:       true,
    }
  }))

  const { error } = await supabase.from('transactions').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, count: rows.length })
}
