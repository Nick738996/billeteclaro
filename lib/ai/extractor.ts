import Groq from 'groq-sdk'
import type { Banco, ExtractedTransaction } from '@/lib/types'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const MODEL = 'llama-3.3-70b-versatile'

export async function extractWithGroq(params: {
  from: string
  subject: string
  date: string
  body: string
  banco: Banco
}): Promise<ExtractedTransaction | null> {
  const snippet = params.body.slice(0, 800)

  const prompt = `Eres un extractor de transacciones financieras colombianas.
Analizas correos de notificación de bancos y fintechs de Colombia y extraes los datos de transacción.
Respondes ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin explicaciones.

Extrae los datos de esta transacción bancaria colombiana.

CORREO:
Remitente: ${params.from}
Asunto: ${params.subject}
Banco detectado: ${params.banco}
Fecha del correo: ${params.date}
Contenido:
${snippet}

REGLAS:
- monto: siempre positivo, en COP (pesos colombianos). "$45.000" o "$45,000" = 45000
- Si hay monto en USD, ponlo en monto_usd y calcula el equivalente en COP si aparece
- fecha: ISO 8601. Si no hay fecha específica, usa la del correo
- comercio: nombre real del establecimiento o persona (no el nombre del banco ni de Rappi)
- Para transferencias, comercio = nombre del destinatario u origen

BANCOS posibles: RAPPICARD (tarjeta crédito Rappi) | RAPPIPAY (cuenta débito Rappi)
TIPOS válidos: COMPRA | TRANSFERENCIA_ENVIADA | TRANSFERENCIA_RECIBIDA | PAGO_SERVICIO | RETIRO | ABONO_DEUDA | INGRESO

CATEGORÍAS válidas: HOGAR | TRANSPORTE | SALIDAS | SALUD | SUSCRIPCIONES | COMPRAS_ONLINE | INVERSION | DONACIONES | EDUCACION | REEMBOLSABLE | TRANSFERENCIA | INGRESO | OTRO

Responde con este JSON exacto:
{
  "fecha": "ISO timestamp o null",
  "monto": number,
  "comercio": "string o null",
  "descripcion": "descripción completa",
  "tipo": "TIPO",
  "categoria": "CATEGORIA",
  "subcategoria": "string o null",
  "moneda": "COP",
  "monto_usd": null,
  "flags": [],
  "error": null
}

Si el correo NO contiene una transacción, responde: {"error": "not_a_transaction"}`

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    })

    const text = completion.choices[0]?.message?.content?.trim() ?? ''
    const parsed = JSON.parse(text)

    if (parsed.error === 'not_a_transaction') return null
    if (!parsed.monto || parsed.monto <= 0) return null

    return {
      fecha: parsed.fecha ?? params.date,
      monto: Number(parsed.monto),
      comercio: parsed.comercio ?? null,
      descripcion: parsed.descripcion ?? null,
      banco: params.banco,
      tipo: parsed.tipo ?? 'COMPRA',
      categoria: parsed.categoria ?? 'OTRO',
      subcategoria: parsed.subcategoria ?? null,
      moneda: parsed.moneda ?? 'COP',
      monto_usd: parsed.monto_usd ?? null,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    }
  } catch (err) {
    console.error('Groq extraction error:', err)
    return null
  }
}
