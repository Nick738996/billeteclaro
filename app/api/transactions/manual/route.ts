import { NextResponse } from 'next/server'
import { getAuthUser, createAdminClient } from '@/lib/supabase/server'
import { generateAuditId } from '@/lib/utils/auditId'
import type { Categoria, Banco, TipoTransaccion } from '@/lib/types'

interface ManualTx {
  fecha: string
  monto: number
  comercio: string
  categoria: Categoria
  tipo: TipoTransaccion
  banco: Banco
}

// POST /api/transactions/manual  body: { items: ManualTx[] }
export async function POST(request: Request) {
  const { user, supabase } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const { items } = await request.json() as { items: ManualTx[] }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items requeridos' }, { status: 400 })
  }

  // Procesar secuencialmente para evitar race condition en generateAuditId:
  // dos queries concurrentes al mismo día devuelven el mismo count → IDs duplicados.
  const rows = []
  for (const tx of items) {
    const fecha = new Date(tx.fecha)
    const auditId = await generateAuditId(admin, user.id, fecha)
    rows.push({
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
    })
  }

  const { error } = await supabase.from('transactions').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, count: rows.length })
}
