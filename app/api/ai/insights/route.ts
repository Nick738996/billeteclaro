import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { startOfMonth, endOfMonth, parseISO, subHours } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { buildAdvisorContext, hashContext } from '@/lib/ai/buildAdvisorContext'
import type { Transaction, Insight } from '@/lib/types'
import { CATEGORIA_LABELS } from '@/lib/types'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const SYSTEM_PROMPT = `Eres BilleteClaro, el asesor financiero personal de colombianos.
Tu trabajo es analizar los gastos del mes y dar consejos concretos, directos y accionables.

Reglas de tono:
- Habla como un amigo contador, no como un banco
- Usa pesos colombianos (ejemplo: $45.000, $1.2M)
- Máximo 5 insights por respuesta
- Cada insight debe ser una sola oración corta y específica
- Nada de perogrulladas ("debes ahorrar más") — siempre con números concretos
- Si algo va bien, dilo. No todo puede ser alarma

Tipos de insight:
- "alerta": categoría superó el 100% del presupuesto (nunca usar para < 100%)
- "consejo": acción concreta con número específico (ej: "tienes $X disponibles en Y")
- "positivo": categoría bajo control o buen comportamiento
- "proyeccion": proyección realista al fin del mes basada en días transcurridos

Reglas críticas para no cometer errores:
- NUNCA compares el gasto total con el presupuesto total si la mayoría de categorías no tienen presupuesto
- "alerta" solo cuando pct_consumido >= 100. Si es 43%, 80%, 90% NO es alerta — es consejo o positivo
- Las transferencias entre cuentas propias NO son gastos reales — ignóralas para el análisis de gastos
- Si una categoría lleva X% con Y días transcurridos de Z totales, evalúa si el ritmo es sostenible
- Para "consejo" con límite de gasto, incluye limite_sugerido en COP (número entero)

Responde SOLO con JSON válido, sin markdown:
{
  "insights": [
    {"tipo": "alerta", "texto": "...", "categoria": "SALIDAS"},
    {"tipo": "consejo", "texto": "...", "categoria": "TRANSPORTE", "limite_sugerido": 80000},
    {"tipo": "positivo", "texto": "..."},
    {"tipo": "proyeccion", "texto": "..."}
  ]
}`

function label(cat: string): string {
  return CATEGORIA_LABELS[cat as keyof typeof CATEGORIA_LABELS] ?? cat
}

function buildContextPrompt(ctx: ReturnType<typeof buildAdvisorContext>): string {
  const diasDelMes = ctx.dias_transcurridos + ctx.dias_restantes
  const pctMes = Math.round((ctx.dias_transcurridos / diasDelMes) * 100)

  // Categorías CON presupuesto — análisis detallado
  const conPresupuesto = Object.entries(ctx.presupuesto_por_categoria)
    .filter(([, limite]) => limite > 0)
    .map(([cat, limite]) => {
      const gastado = ctx.gastos_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0
      const pct = Math.round((gastado / limite) * 100)
      const estado = pct >= 100 ? 'EXCEDIDO' : pct >= 80 ? 'CERCA DEL LÍMITE' : 'OK'
      return `  ${label(cat)}: gastado $${gastado.toLocaleString('es-CO')} / límite $${limite.toLocaleString('es-CO')} (${pct}% — ${estado})`
    })

  // Categorías SIN presupuesto (excluye TRANSFERENCIA — no son gastos reales)
  const sinPresupuesto = Object.entries(ctx.gastos_por_categoria)
    .filter(([cat, val]) =>
      cat !== 'TRANSFERENCIA' &&
      val > 0 &&
      (ctx.presupuesto_por_categoria[cat as keyof typeof ctx.presupuesto_por_categoria] ?? 0) === 0
    )
    .map(([cat, val]) => `  ${label(cat)}: $${val.toLocaleString('es-CO')} (sin presupuesto)`)

  // Transferencias (informativo)
  const transferencias = ctx.gastos_por_categoria['TRANSFERENCIA' as keyof typeof ctx.gastos_por_categoria] ?? 0

  const gastosReales = ctx.total_gastado - transferencias

  return `Mes: ${ctx.mes}
Días transcurridos: ${ctx.dias_transcurridos} de ${diasDelMes} (${pctMes}% del mes) | Días restantes: ${ctx.dias_restantes}

Ingresos del mes: $${ctx.ingreso_estimado.toLocaleString('es-CO')}
Gastos reales del mes (sin transferencias): $${gastosReales.toLocaleString('es-CO')}
${transferencias > 0 ? `Transferencias entre cuentas propias (no analizar como gasto): $${transferencias.toLocaleString('es-CO')}` : ''}

CATEGORÍAS CON PRESUPUESTO:
${conPresupuesto.length ? conPresupuesto.join('\n') : '  (ninguna)'}

CATEGORÍAS SIN PRESUPUESTO:
${sinPresupuesto.length ? sinPresupuesto.join('\n') : '  (ninguna)'}`
}

// GET /api/ai/insights?mes=YYYY-MM
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const mes = url.searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)

  // Cargar transacciones del mes
  const ref = parseISO(`${mes}-01`)
  const { data: txData } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .gte('fecha', startOfMonth(ref).toISOString())
    .lte('fecha', endOfMonth(ref).toISOString())

  const transactions = (txData ?? []) as Transaction[]

  // Cargar presupuestos del mes
  const { data: budgetData } = await supabase
    .from('budgets')
    .select('categoria, monto_presupuestado')
    .eq('user_id', user.id)
    .eq('mes', mes)

  const budgets: Record<string, number> = {}
  for (const row of budgetData ?? []) {
    budgets[row.categoria] = Number(row.monto_presupuestado)
  }

  const ctx = buildAdvisorContext(mes, transactions, budgets)
  const hash = hashContext(ctx)

  // Verificar caché (válido si hash coincide y tiene < 6h)
  const { data: cached } = await supabase
    .from('ai_insights')
    .select('insights, generated_at, context_hash')
    .eq('user_id', user.id)
    .eq('mes', mes)
    .single()

  const cacheExpiry = subHours(new Date(), 6)
  if (
    cached &&
    cached.context_hash === hash &&
    new Date(cached.generated_at) > cacheExpiry
  ) {
    return NextResponse.json({ insights: cached.insights, cached: true })
  }

  // Llamar a Groq
  let insights: Insight[] = []
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `CONTEXTO DEL USUARIO:\n${buildContextPrompt(ctx)}` },
      ],
    })
    const text = completion.choices[0]?.message?.content?.trim() ?? ''
    const parsed = JSON.parse(text)
    insights = Array.isArray(parsed.insights) ? parsed.insights : []
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai/insights] Groq error:', msg)
    return NextResponse.json({ error: 'Error generando insights' }, { status: 500 })
  }

  // Guardar en caché
  await supabase
    .from('ai_insights')
    .upsert(
      { user_id: user.id, mes, insights, context_hash: hash, generated_at: new Date().toISOString() },
      { onConflict: 'user_id,mes' }
    )

  return NextResponse.json({ insights, cached: false })
}
