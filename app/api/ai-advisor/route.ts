import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Categoria } from '@/lib/types'
import { CATEGORIA_LABELS, formatCOP } from '@/lib/types'

export interface AdvisorInsight {
  tipo: 'alerta' | 'consejo' | 'positivo'
  texto: string
}

interface AdvisorRequest {
  mes: string
  gastos: Record<string, number>
  budgets: Record<string, number>
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-lite',
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 600,
    responseMimeType: 'application/json',
  },
})

export async function POST(request: Request) {
  const { mes, gastos, budgets } = await request.json() as AdvisorRequest

  const lineas = Object.entries(budgets)
    .filter(([cat]) => (gastos[cat] ?? 0) > 0 || budgets[cat] > 0)
    .map(([cat, limite]) => {
      const real = gastos[cat] ?? 0
      const pct  = limite > 0 ? Math.round((real / limite) * 100) : null
      const label = CATEGORIA_LABELS[cat as Categoria] ?? cat
      return `- ${label}: gasto ${formatCOP(real)}${limite > 0 ? ` / presupuesto ${formatCOP(limite)} (${pct}%)` : ' (sin presupuesto)'}`
    })
    .join('\n')

  const prompt = `Eres un asesor financiero personal para un colombiano. Analiza sus finanzas del mes ${mes} y da máximo 4 insights útiles.

Datos del mes:
${lineas}

Reglas:
- Máximo 4 bullets, cada uno de 1 sola oración corta
- Usa pesos colombianos (COP) con el formato $X.XXX
- Sé directo, sin relleno ni introducciones
- Si un gasto supera el 100% del presupuesto: es una alerta
- Si está entre 80% y 100%: consejo de precaución
- Si hay categorías bien controladas (< 70%): es positivo
- Si no hay presupuesto para una categoría con gasto alto: consejo de configurarlo

Responde SOLO con JSON: { "insights": [{ "tipo": "alerta"|"consejo"|"positivo", "texto": "..." }] }`

  try {
    const result = await model.generateContent(prompt)
    const raw = result.response.text()
    const parsed = JSON.parse(raw) as { insights: AdvisorInsight[] }
    return NextResponse.json({ insights: parsed.insights ?? [] })
  } catch {
    return NextResponse.json({ error: 'Error al generar análisis' }, { status: 500 })
  }
}
