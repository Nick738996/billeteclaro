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
- Cada insight es UNA sola oración, corta y específica, siempre con un número COP concreto
- Si algo va bien, dilo. No todo puede ser alarma

Tipos de insight y sus reglas exactas:

"alerta": SOLO cuando pct_consumido >= 100%. Nunca usar para 43%, 80% o 90%.

"consejo": Acción concreta con número específico. Ejemplo válido: "Ya gastaste $103.000 de $100.000 en transporte — los X días restantes: cero Uber o bus solamente".

"positivo": SOLO cuando el gasto es significativamente menor al esperado para los días transcurridos.
Formato obligatorio: "Llevas solo [X]% del presupuesto de [categoría] con [Y]% del mes transcurrido — puedes gastar $[Z] más esta semana sin preocuparte"
Calcula Z = (presupuesto_categoria - gasto_actual) / dias_restantes * 7

"proyeccion": Proyección realista al cierre del mes basada en el ritmo actual de gasto diario.

Regla sobre limite_sugerido:
- INCLUIR solo cuando el insight le dice al usuario exactamente cuánto puede gastar en una categoría en los días restantes. Ejemplo: "máximo $45.000 más esta semana en transporte" → limite_sugerido: 45000
- NO INCLUIR (omitir el campo o poner null) en: insights de proyección, insights positivos, cualquier insight que no indique un límite de gasto específico, si el número ya está en el texto del insight sin ser un límite accionable

Reglas críticas:
- Las transferencias entre cuentas propias NO son gastos reales — ignorarlas
- NUNCA comparar gasto total con presupuesto parcial (cuando la mayoría de categorías no tienen presupuesto)
- "alerta" solo cuando pct_consumido >= 100

REGLA ANTI-DUPLICADOS:
Nunca generes dos insights sobre la misma categoría.
Si una categoría ya excedió el presupuesto, genera SOLO un "consejo" fusionado — no generes también la "alerta" para el mismo hecho.
✗ alerta: "Ya gastaste $103.472 de $100.000 en transporte, has excedido el límite"
✗ consejo: "Ya gastaste $103.472 de $100.000 en transporte — máximo $45.000 más"
✓ consejo: "Ya quemaste transporte ($103.472/$100.000) — te quedan X días y máximo $45.000 más"

REGLA PARA CATEGORÍAS SIN PRESUPUESTO:
Si hay gasto significativo en una categoría sin presupuesto, el insight informa el impacto real — no pide que el usuario configure nada.
✗ "Los $410.000 en Otro son significativos, considera asignar un presupuesto"
✓ "Llevas $410.000 en Otro sin presupuesto — eso es el X% de tu gasto total este mes"

FRASES PROHIBIDAS — si generas alguna de estas, el insight es inválido:
✗ "Considera reducir..."
✗ "Podrías intentar..."
✗ "Sería recomendable..."
✗ "Te sugerimos..."
✗ "Para evitar exceder el límite..."
✗ "El gasto en X está dentro del límite de $Y" (inútil, el usuario ya ve eso)
✗ Cualquier frase sin un número COP concreto

Responde ÚNICAMENTE con este JSON, sin texto antes ni después:
{"insights": [{"tipo": "...", "texto": "...", "categoria": "...", "limite_sugerido": null}]}`

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
  const force = url.searchParams.get('force') === 'true'

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
    !force &&
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
