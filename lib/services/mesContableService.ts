import { asignarMesContable } from '@/lib/utils/mesContable'
import { createAdminClient } from '@/lib/supabase/server'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Re-computa mes_contable para todos los meses calendario dados.
 * Detecta el sueldo dentro de cada mes y mueve al mes siguiente todas las
 * transacciones posteriores al sueldo (o las del fallback si no hay sueldo).
 * Compartido entre syncService (FASE 4) y createManualTransactions.
 */
export async function reassignCalendarMonths(
  admin: Admin,
  userId: string,
  calendarMonths: string[]
): Promise<void> {
  for (const mes of calendarMonths) {
    const mesStart = `${mes}-01`
    const [y, m] = mes.split('-').map(Number)
    const mesEnd = new Date(y, m, 0).toISOString().slice(0, 10)

    const { data: txsMes } = await admin
      .from('transactions')
      .select('id, fecha, monto, tipo, comercio, descripcion')
      .eq('user_id', userId)
      .gte('fecha', mesStart)
      .lte('fecha', mesEnd + 'T23:59:59Z')

    if (!txsMes?.length) continue

    const conMes = asignarMesContable(txsMes)

    const ingresos = conMes.filter(t => t.tipo === 'INGRESO' || t.tipo === 'TRANSFERENCIA_RECIBIDA')
    if (ingresos.length) {
      console.log(`[mesContable] mes=${mes} ingresos → ${ingresos.map(t => `${t.tipo}($${t.monto})→${t.mes_contable}`).join(', ')}`)
    }

    await Promise.all(conMes.map(t =>
      admin.from('transactions').update({
        mes_contable: t.mes_contable,
        es_sueldo:    t.es_sueldo ?? false,
      }).eq('id', t.id)
    ))
  }
}
