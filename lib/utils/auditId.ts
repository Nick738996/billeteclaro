import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'

export async function generateAuditId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  fecha: Date
): Promise<string> {
  const dayStart = new Date(fecha)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(fecha)
  dayEnd.setHours(23, 59, 59, 999)

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
