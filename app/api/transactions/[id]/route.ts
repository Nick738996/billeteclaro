import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch first to get gmail_message_id and verify ownership
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, gmail_message_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Gmail transactions: add to skipped_ids so the next sync ignores the email
  const isManual = tx.gmail_message_id?.startsWith('manual_')
  if (!isManual && tx.gmail_message_id) {
    const admin = createAdminClient()
    await admin.from('sync_log').insert({
      user_id: user.id,
      status: 'SKIPPED',
      skipped_ids: [tx.gmail_message_id],
      correos_revisados: 0,
      transacciones_nuevas: 0,
      errores: [],
    })
  }

  return NextResponse.json({ ok: true })
}
