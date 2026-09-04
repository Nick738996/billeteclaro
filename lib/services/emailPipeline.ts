import { trySpecificParser } from '@/lib/parsers'
import { tryGenericParser } from '@/lib/parsers/generic'
import { extractWithGroq } from '@/lib/ai/extractor'
import type { EmailMessage } from '@/lib/email/types'
import type { Banco, ExtractedTransaction } from '@/lib/types'

// Orden de intentos: parser específico (más preciso) → parser genérico
// (patrones comunes a la mayoría de bancos, sin costo de IA) → Groq (último
// recurso, solo si el banco fue identificado por remitente — nunca se gasta
// cuota de IA en correos de remitentes desconocidos).
export async function extractTransaction(email: EmailMessage, banco: Banco): Promise<ExtractedTransaction | null> {
  const emailInput = { id: email.id, from: email.from, subject: email.subject, date: email.date, body: email.body }

  const specific = trySpecificParser(banco, emailInput)
  if (specific) return { ...specific, banco }

  const generic = tryGenericParser(emailInput, banco)
  if (generic) return generic

  if (banco === 'OTRO') return null
  return extractWithGroq({ from: email.from, subject: email.subject, date: email.date, body: email.body, banco })
}
