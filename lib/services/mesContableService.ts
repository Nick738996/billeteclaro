import { asignarMesContable, colombiaMonthRangeUTC } from '@/lib/utils/mesContable'
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
    // Rango en hora Colombia, no UTC — una transacción a las 19:45 COL del 31
    // de agosto ya es 2026-09-01T00:45Z, pero sigue siendo agosto en Colombia
    // (y por lo tanto debe verse junto con el sueldo de agosto al reasignar).
    const { start: mesStart, end: mesEnd } = colombiaMonthRangeUTC(mes)

    const { data: txsMes } = await admin
      .from('transactions')
      .select('id, fecha, monto, tipo, comercio, descripcion')
      .eq('user_id', userId)
      .gte('fecha', mesStart)
      .lte('fecha', mesEnd)

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
