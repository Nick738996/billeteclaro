import Groq from 'groq-sdk'
import type { Banco, ExtractedTransaction } from '@/lib/types'

let _groq: Groq | null = null
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _groq
}

const SYSTEM_PROMPT = `Eres un extractor de transacciones bancarias colombianas.
Tu única función: extraer datos estructurados de correos de notificación bancaria.

BANCOS COLOMBIANOS QUE PUEDES ENCONTRAR:
Bancolombia, Davivienda, BBVA, Scotiabank Colpatria, Banco de Bogotá,
Banco Popular, Itaú, Falabella, Nu Colombia, Lulo Bank, Nequi,
RappiCard, RappiPay, Banco Caja Social, Banco Agrario, Citibank Colombia.

CAMPOS A EXTRAER:
- monto: número entero en COP sin decimales ni puntos (ej: 45000, no $45.000)
- comercio: nombre del establecimiento en Title Case (ej: "Uber", "Éxito", "Netflix")
  Si es una transferencia, usar el nombre de la persona o "Transferencia"
  Si es un pago de servicio, usar el nombre del servicio (ej: "Acueducto", "Gas Natural")
- tipo: uno de COMPRA | TRANSFERENCIA_ENVIADA | TRANSFERENCIA_RECIBIDA |
         PAGO_SERVICIO | RETIRO | ABONO_DEUDA | INGRESO
- fecha: ISO 8601 con hora si está disponible (ej: "2026-06-13T14:05:00")
  Si no hay hora en el correo, usar "2026-06-13T00:00:00"
- banco: nombre del banco en mayúsculas (ej: "BANCOLOMBIA", "RAPPICARD")
- descripcion: texto corto descriptivo opcional

REGLAS CRÍTICAS:
1. monto SIEMPRE es entero positivo en COP. Sin decimales.
   $45.000,00 → 45000 | $1.200.000 → 1200000 | $6.790,50 → 6790
2. Si el correo NO es una notificación de transacción bancaria → {"error": "not_a_transaction"}
3. Si no puedes extraer monto o fecha con certeza → {"error": "not_a_transaction"}
4. NUNCA inventes datos que no estén en el correo

Responde ÚNICAMENTE con JSON válido, sin markdown:`

export async function extractWithGroq(params: {
  from: string
  subject: string
  date: string
  body: string
  banco: Banco
}): Promise<ExtractedTransaction | null> {
  const userPrompt = `Banco detectado: ${params.banco}
Remitente: ${params.from}
Asunto: ${params.subject}
Fecha del correo: ${params.date}
Cuerpo:
${params.body.slice(0, 1000)}`

  try {
    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
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
