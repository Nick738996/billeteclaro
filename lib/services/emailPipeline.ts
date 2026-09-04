import { trySpecificParser } from '@/lib/parsers'
import { tryGenericParser } from '@/lib/parsers/generic'
import { extractWithGroq } from '@/lib/ai/extractor'
import { convertToCOP, convertToUSD } from '@/lib/utils/exchangeRate'
import type { EmailMessage } from '@/lib/email/types'
import type { Banco, ExtractedTransaction } from '@/lib/types'

// Orden de intentos: parser específico (más preciso) → parser genérico
// (patrones comunes en español o inglés, sin costo de IA) → Groq (último
// recurso, cualquier idioma/banco/país).
//
// El fallback de IA corre incluso para banco === 'OTRO' (remitente
// desconocido): en el flujo de reenvío eso ya no es "spam colándose" como en
// el sync viejo por OAuth — el usuario mismo curó la fuente al configurar su
// propio filtro de Gmail/Outlook, así que un remitente desconocido acá es
// simplemente un banco que no está en nuestra lista (posiblemente
// extranjero), no un correo no solicitado.
export async function extractTransaction(email: EmailMessage, banco: Banco): Promise<ExtractedTransaction | null> {
  const emailInput = { id: email.id, from: email.from, subject: email.subject, date: email.date, body: email.body }

  const specific = trySpecificParser(banco, emailInput)
  if (specific) return { ...specific, banco }

  const generic = tryGenericParser(emailInput, banco)
  if (generic) return normalizeCurrency(generic)

  const ai = await extractWithGroq({ from: email.from, subject: email.subject, date: email.date, body: email.body, banco })
  return ai ? normalizeCurrency(ai) : null
}

// El resto de la app (presupuestos, stats del dashboard, el asesor) suma
// `monto` asumiendo que siempre está en COP — así que cualquier transacción
// en otra moneda (banco extranjero) se convierte acá, en un único lugar, en
// vez de tener que enseñarle a cada consumidor a manejar múltiples monedas.
// Si la conversión falla (ej. la API de tasas de cambio no responde), se
// deja la transacción tal cual venía — mejor insertarla con su moneda
// original marcada que perderla del todo.
async function normalizeCurrency(tx: ExtractedTransaction): Promise<ExtractedTransaction> {
  if (tx.moneda === 'COP') return tx

  const montoOriginal = tx.monto
  const monedaOriginal = tx.moneda
  // Tasa del día real de la transacción, no la de hoy — así la conversión no
  // cambia si el correo se reprocesa más adelante.
  const [montoCOP, montoUSD] = await Promise.all([
    convertToCOP(montoOriginal, monedaOriginal, tx.fecha ?? undefined),
    convertToUSD(montoOriginal, monedaOriginal, tx.fecha ?? undefined),
  ])

  if (montoCOP == null) {
    return { ...tx, flags: [...tx.flags, 'moneda_no_cop'] }
  }

  const notaOriginal = `${montoOriginal} ${monedaOriginal}`
  return {
    ...tx,
    monto: montoCOP,
    moneda: 'COP',
    monto_usd: montoUSD ?? tx.monto_usd,
    descripcion: tx.descripcion ? `${tx.descripcion} (${notaOriginal})` : notaOriginal,
    flags: [...tx.flags, 'monto_convertido'],
  }
}
