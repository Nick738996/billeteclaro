import Groq from 'groq-sdk'
import type { Banco, ExtractedTransaction } from '@/lib/types'
import { cleanComercio } from '@/lib/parsers/utils'

let _groq: Groq | null = null
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _groq
}

const SYSTEM_PROMPT = `Eres un extractor de transacciones bancarias. Tu única función:
extraer datos estructurados de correos de notificación bancaria — de cualquier
banco, país o idioma. No asumas que el correo es de un banco colombiano.

ALGUNOS BANCOS COLOMBIANOS CONOCIDOS (lista de referencia, no exhaustiva —
el correo puede ser de cualquier otro banco, colombiano o extranjero):
Bancolombia, Davivienda, BBVA, Scotiabank Colpatria, Banco de Bogotá,
Banco Popular, Itaú, Falabella, Nu Colombia, Lulo Bank, Nequi,
RappiCard, RappiPay, Banco Caja Social, Banco Agrario, Citibank Colombia.

CAMPOS A EXTRAER:
- monto: número positivo en la moneda real de la transacción.
  Para COP: entero sin decimales (ej: $45.000,00 → 45000).
  Para otras monedas (USD, EUR, etc.): hasta 2 decimales (ej: $45.50 → 45.5).
- moneda: código ISO de la moneda real detectada (COP, USD, EUR, etc.).
  NUNCA asumas COP por defecto — infiérela del símbolo, código de moneda
  explícito, idioma del correo y dominio del remitente.
- comercio: nombre corto y reconocible del establecimiento en Title Case
  (ej: "Uber", "Éxito", "Netflix", "Starbucks"), máximo ~30 caracteres.
  NUNCA incluyas razón social (S.A.S, LTDA, S.A., E.S.P.), códigos de
  sucursal/referencia, ni prefijos de procesador de pago (ej. "DL*") — solo
  el nombre comercial que reconocería el usuario.
  Si es una transferencia, usar el nombre de la persona o "Transferencia"
  Si es un pago de servicio, usar el nombre del servicio (ej: "Acueducto", "Gas Natural")
- tipo: uno de COMPRA | TRANSFERENCIA_ENVIADA | TRANSFERENCIA_RECIBIDA |
         PAGO_SERVICIO | RETIRO | ABONO_DEUDA | INGRESO
- fecha: ISO 8601 con hora si está disponible (ej: "2026-06-13T14:05:00")
  Si no hay hora en el correo, usar "2026-06-13T00:00:00"
- descripcion: texto corto descriptivo opcional — si identificas el nombre real
  de la entidad/banco (aunque no esté en la lista de referencia), inclúyelo aquí.

REGLAS CRÍTICAS:
1. Detecta la moneda real — nunca conviertas ni asumas COP para un correo en
   otro idioma o de un banco no colombiano.
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
${params.body.slice(0, 4000)}`

  try {
    const completion = await getGroq().chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0.1,
      max_tokens: 2048,
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

    const moneda = (parsed.moneda ?? 'COP').toUpperCase()
    const flags = Array.isArray(parsed.flags) ? [...parsed.flags] : []
    // banco === 'OTRO' se mantiene tal cual (el nombre real que infiera la IA
    // no encaja en el enum de `banco` que valida la DB) — el nombre real, si
    // lo identificó, queda en `descripcion` para que el usuario lo vea igual.
    // La conversión a COP (si moneda !== 'COP') pasa en un solo lugar —
    // ver lib/services/emailPipeline.ts::normalizeCurrency.

    return {
      fecha: parsed.fecha ?? params.date,
      monto: Number(parsed.monto),
      comercio: parsed.comercio ? cleanComercio(parsed.comercio) : null,
      descripcion: parsed.descripcion ?? null,
      banco: params.banco,
      tipo: parsed.tipo ?? 'COMPRA',
      categoria: parsed.categoria ?? 'OTRO',
      subcategoria: parsed.subcategoria ?? null,
      moneda,
      monto_usd: moneda === 'USD' ? Number(parsed.monto) : (parsed.monto_usd ?? null),
      flags,
    }
  } catch (err) {
    console.error('Groq extraction error:', err)
    return null
  }
}
