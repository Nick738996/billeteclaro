import Groq from 'groq-sdk'
import type { Categoria } from '@/lib/types'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const VALID_CATS: Categoria[] = [
  'HOGAR', 'TRANSPORTE', 'SALIDAS', 'SALUD', 'SUSCRIPCIONES',
  'COMPRAS_ONLINE', 'INVERSION', 'AHORROS', 'DEUDA', 'DONACIONES',
  'EDUCACION', 'REEMBOLSABLE', 'TRANSFERENCIA', 'INGRESO', 'OTRO',
]

const CATS_DESC = `HOGAR (supermercados, servicios públicos, tiendas hogar: Éxito, Jumbo, Makro, Homecenter) | TRANSPORTE (Uber, InDriver, taxi, gasolina, peajes, parqueadero) | SALIDAS (restaurantes, bares, cafés, domicilios de comida) | SALUD (farmacias, clínicas, hospitales, gimnasios, ópticas) | SUSCRIPCIONES (Netflix, Spotify, apps, servicios digitales) | COMPRAS_ONLINE (Amazon, Mercado Libre, tiendas online) | INVERSION (bolsa, crypto, fondos de inversión) | AHORROS (CDT, cuentas de ahorro, metas de ahorro) | DEUDA (pagos de tarjeta de crédito, cuotas de crédito) | DONACIONES (fundaciones, ONGs, iglesias) | EDUCACION (colegios, universidades, cursos, libros) | REEMBOLSABLE (gastos que serán reembolsados por trabajo) | TRANSFERENCIA (transferencias entre personas) | INGRESO (salario, ingresos) | OTRO (no encaja en ninguna categoría)`

const BATCH_SIZE = 20

export async function classifyMerchants(
  merchants: string[]
): Promise<Record<string, Categoria>> {
  if (merchants.length === 0) return {}

  const result: Record<string, Categoria> = {}

  for (let i = 0; i < merchants.length; i += BATCH_SIZE) {
    const batch = merchants.slice(i, i + BATCH_SIZE)
    const items = batch.map((name, idx) => ({ id: idx + 1, name }))

    const prompt = `Eres un categorizador de transacciones financieras colombianas.
Clasifica cada comercio en la categoría más apropiada para Colombia.

CATEGORÍAS: ${CATS_DESC}

Comercios a clasificar:
${JSON.stringify(items)}

Responde ÚNICAMENTE con JSON válido, sin markdown:
{"results": [{"id": 1, "categoria": "CATEGORIA"}, ...]}`

    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      })

      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      const parsed = JSON.parse(text)

      for (const r of (parsed.results ?? [])) {
        const name = batch[r.id - 1]
        if (name && VALID_CATS.includes(r.categoria)) {
          result[name] = r.categoria
        }
      }
    } catch (err) {
      console.error('[categorizer] Groq error:', err)
    }
  }

  return result
}
