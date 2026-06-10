import Groq from 'groq-sdk'
import { startOfMonth, endOfMonth, parseISO, subHours } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAdvisorContext, hashContext } from '@/lib/ai/buildAdvisorContext'
import { CATEGORIA_LABELS } from '@/lib/types'
import type { Transaction, Insight } from '@/lib/types'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ── Prompts ──────────────────────────────────────────────────────────────────

const INSIGHTS_SYSTEM_PROMPT = `Eres BilleteClaro, el asesor financiero personal de colombianos.
Tu trabajo es analizar los gastos del mes y dar consejos concretos, directos y accionables.

Reglas de tono:
- Habla como un amigo contador, no como un banco
- Usa pesos colombianos (ejemplo: $45.000, $1.2M)
- Máximo 5 insights por respuesta
- Cada insight es UNA sola oración, corta y específica, siempre con un número COP concreto
- Si algo va bien, dilo. No todo puede ser alarma

Tipos de insight y sus reglas exactas:

"alerta": SOLO cuando pct_consumido >= 100%. Nunca usar para 43%, 80% o 90%.

"consejo": Acción concreta que el usuario puede ejecutar HOY, con número exacto de impacto.
  → Solo si hay algo específico que hacer: "máximo $X más", "cancela Y para ahorrar $Z"
  → Siempre con un número COP concreto y un verbo imperativo implícito

"observacion": Dato relevante que el usuario probablemente no sabe, sin acción obvia.
  → Para categorías sin presupuesto, patrones inusuales, o hechos que merecen atención
  → Sin verbo imperativo — solo el dato y su implicación
  → Ejemplos válidos:
     "El 37,6% de tu gasto ($410.000) está sin categorizar en Otro — sin visibilidad sobre ese dinero no puedes saber dónde ajustar"
     "$467.217 en Suscripciones es casi la mitad de lo que gastaste este mes — ¿sabes cuáles sigues usando?"
  → La pregunta retórica ("¿sabes cuáles sigues usando?") está permitida SOLO para Suscripciones

Criterio para elegir entre consejo y observacion:
- ¿Hay un número concreto que el usuario puede gastar o ahorrar HOY? → consejo
- ¿Es un dato que merece atención pero no tiene acción inmediata obvia? → observacion

"positivo": SOLO cuando el gasto es significativamente menor al esperado para los días transcurridos.
Formato obligatorio: "Llevas solo [X]% del presupuesto de [categoría] con [Y]% del mes transcurrido — puedes gastar $[Z] más esta semana sin preocuparte"
Calcula Z = (presupuesto_categoria - gasto_actual) / dias_restantes * 7

"proyeccion": Proyección realista al cierre del mes basada en el ritmo actual de gasto diario.

Regla sobre limite_sugerido:
- INCLUIR solo cuando el insight le dice al usuario exactamente cuánto puede gastar en una categoría en los días restantes.
- NO INCLUIR en: insights de proyección, insights positivos, cualquier insight que no indique un límite accionable

Reglas críticas:
- Las transferencias entre cuentas propias NO son gastos reales — ignorarlas
- NUNCA comparar gasto total con presupuesto parcial
- "alerta" solo cuando pct_consumido >= 100

REGLA ANTI-DUPLICADOS:
Nunca generes dos insights sobre la misma categoría.
Si una categoría ya excedió el presupuesto, genera SOLO un "consejo" fusionado.
✗ alerta: "Ya gastaste $103.472 de $100.000 en transporte"
✓ consejo: "Ya quemaste transporte ($103.472/$100.000) — te quedan X días y máximo $45.000 más"

REGLA PARA CATEGORÍAS SIN PRESUPUESTO:
El insight informa el impacto real — no pide que el usuario configure nada.
✗ "considera asignar un presupuesto"
✓ "Llevas $410.000 en Otro sin presupuesto — eso es el X% de tu gasto total este mes"

REGLA: CUANDO EL LÍMITE RESTANTE ES $0 O NEGATIVO
NUNCA digas "máximo $0 más" ni uses un límite negativo.
Estructura: exceso → consecuencia concreta → comercio top si aplica.
✓ "Te pasaste $3.472 en transporte — los próximos 21 días sin Uber o bus solamente"
limite_sugerido en este caso: 0 o null. Nunca negativo.

FRASES PROHIBIDAS:
✗ "Considera reducir..." ✗ "Podrías intentar..." ✗ "Sería recomendable..."
✗ "Te sugerimos..." ✗ "Para evitar exceder el límite..." ✗ Cualquier frase sin número COP

Responde ÚNICAMENTE con este JSON:
{"insights": [{"tipo": "...", "texto": "...", "categoria": "...", "limite_sugerido": null}]}`

const CHAT_SYSTEM_PROMPT = `Eres BilleteClaro, el asesor financiero personal de colombianos.
Hablas como un amigo contador: directo, sin rodeos, con números concretos en pesos colombianos.
Estás en modo conversacional. El usuario puede preguntarte sobre sus finanzas.
Tienes acceso al contexto completo de su mes: gastos, presupuestos y días restantes.
Responde máximo en 3 oraciones. Si el usuario pregunta por un límite concreto (finde, semana), calcula con los datos del contexto.
Nada de perogrulladas — siempre con cifras específicas.`

// ── Helpers de contexto ───────────────────────────────────────────────────────

function catLabel(cat: string): string {
  return CATEGORIA_LABELS[cat as keyof typeof CATEGORIA_LABELS] ?? cat
}

function buildInsightsContextPrompt(ctx: ReturnType<typeof buildAdvisorContext>): string {
  const diasDelMes = ctx.dias_transcurridos + ctx.dias_restantes
  const pctMes = Math.round((ctx.dias_transcurridos / diasDelMes) * 100)
  const transferencias = ctx.gastos_por_categoria['TRANSFERENCIA' as keyof typeof ctx.gastos_por_categoria] ?? 0

  const conPresupuesto = Object.entries(ctx.presupuesto_por_categoria)
    .filter(([, limite]) => limite > 0)
    .map(([cat, limite]) => {
      const gastado = ctx.gastos_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0
      const pct = Math.round((gastado / limite) * 100)
      const estado = pct >= 100 ? 'EXCEDIDO' : pct >= 80 ? 'CERCA DEL LÍMITE' : 'OK'
      return `  ${catLabel(cat)}: gastado $${gastado.toLocaleString('es-CO')} / límite $${limite.toLocaleString('es-CO')} (${pct}% — ${estado})`
    })

  const sinPresupuesto = Object.entries(ctx.gastos_por_categoria)
    .filter(([cat, val]) =>
      cat !== 'TRANSFERENCIA' && val > 0 &&
      (ctx.presupuesto_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0) === 0
    )
    .map(([cat, val]) => `  ${catLabel(cat)}: $${val.toLocaleString('es-CO')} (sin presupuesto)`)

  return `Mes: ${ctx.mes}
Días transcurridos: ${ctx.dias_transcurridos} de ${diasDelMes} (${pctMes}% del mes) | Días restantes: ${ctx.dias_restantes}
Ingresos del mes: $${ctx.ingreso_estimado.toLocaleString('es-CO')}
Gastos reales del mes (sin transferencias): $${(ctx.total_gastado - transferencias).toLocaleString('es-CO')}
${transferencias > 0 ? `Transferencias entre cuentas propias (no analizar como gasto): $${transferencias.toLocaleString('es-CO')}` : ''}

CATEGORÍAS CON PRESUPUESTO:
${conPresupuesto.length ? conPresupuesto.join('\n') : '  (ninguna)'}

CATEGORÍAS SIN PRESUPUESTO:
${sinPresupuesto.length ? sinPresupuesto.join('\n') : '  (ninguna)'}`
}

function buildChatContextBlock(ctx: ReturnType<typeof buildAdvisorContext>, insights: Insight[]): string {
  const diasDelMes = ctx.dias_transcurridos + ctx.dias_restantes
  const transferencias = ctx.gastos_por_categoria['TRANSFERENCIA' as keyof typeof ctx.gastos_por_categoria] ?? 0

  const conPresupuesto = Object.entries(ctx.presupuesto_por_categoria)
    .filter(([, limite]) => limite > 0)
    .map(([cat, limite]) => {
      const gastado = ctx.gastos_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0
      return `${catLabel(cat)}: $${gastado.toLocaleString('es-CO')} / $${limite.toLocaleString('es-CO')} (${Math.round((gastado / limite) * 100)}%)`
    }).join(' | ')

  const sinPresupuesto = Object.entries(ctx.gastos_por_categoria)
    .filter(([cat, val]) =>
      cat !== 'TRANSFERENCIA' && val > 0 &&
      (ctx.presupuesto_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0) === 0
    )
    .map(([cat, val]) => `${catLabel(cat)}: $${val.toLocaleString('es-CO')}`).join(' | ')

  return `=== CONTEXTO FINANCIERO ===
Mes: ${ctx.mes} | Día ${ctx.dias_transcurridos} de ${diasDelMes} | Restantes: ${ctx.dias_restantes} días (${ctx.dias_restantes_semana} de semana)
Ingresos: $${ctx.ingreso_estimado.toLocaleString('es-CO')} | Gastos reales: $${(ctx.total_gastado - transferencias).toLocaleString('es-CO')}
Con presupuesto: ${conPresupuesto || 'ninguno'}
Sin presupuesto: ${sinPresupuesto || 'ninguno'}
${insights.length ? `Insights:\n${insights.map(i => `- [${i.tipo}] ${i.texto}`).join('\n')}` : ''}
===========================`
}

// ── Queries de datos ──────────────────────────────────────────────────────────

async function fetchMonthContext(supabase: SupabaseClient, userId: string, mes: string) {
  const ref = parseISO(`${mes}-01`)
  const [{ data: txData }, { data: budgetData }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('fecha', startOfMonth(ref).toISOString())
      .lte('fecha', endOfMonth(ref).toISOString()),
    supabase
      .from('budgets')
      .select('categoria, monto_presupuestado')
      .eq('user_id', userId)
      .eq('mes', mes),
  ])

  const transactions = (txData ?? []) as Transaction[]
  const budgets: Record<string, number> = {}
  for (const row of budgetData ?? []) {
    budgets[row.categoria] = Number(row.monto_presupuestado)
  }
  return { transactions, budgets }
}

// ── Servicios públicos ────────────────────────────────────────────────────────

export interface InsightsResult {
  insights: Insight[]
  cached: boolean
}

export async function getInsights(
  supabase: SupabaseClient,
  userId: string,
  mes: string,
  force: boolean
): Promise<InsightsResult> {
  const { transactions, budgets } = await fetchMonthContext(supabase, userId, mes)
  const ctx = buildAdvisorContext(mes, transactions, budgets)
  const hash = hashContext(ctx)

  // Cache hit: mismo hash + menos de 6h
  if (!force) {
    const { data: cached } = await supabase
      .from('ai_insights')
      .select('insights, generated_at, context_hash')
      .eq('user_id', userId)
      .eq('mes', mes)
      .single()

    if (cached && cached.context_hash === hash && new Date(cached.generated_at) > subHours(new Date(), 6)) {
      return { insights: cached.insights as Insight[], cached: true }
    }
  }

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: INSIGHTS_SYSTEM_PROMPT },
      { role: 'user',   content: `CONTEXTO DEL USUARIO:\n${buildInsightsContextPrompt(ctx)}` },
    ],
  })

  const text = completion.choices[0]?.message?.content?.trim() ?? ''
  const insights: Insight[] = Array.isArray(JSON.parse(text).insights) ? JSON.parse(text).insights : []

  await supabase.from('ai_insights').upsert(
    { user_id: userId, mes, insights, context_hash: hash, generated_at: new Date().toISOString() },
    { onConflict: 'user_id,mes' }
  )

  return { insights, cached: false }
}

export async function sendChatMessage(
  supabase: SupabaseClient,
  userId: string,
  mes: string,
  message: string
): Promise<string> {
  const [{ transactions, budgets }, { data: cachedInsights }, { data: history }] = await Promise.all([
    fetchMonthContext(supabase, userId, mes),
    supabase.from('ai_insights').select('insights').eq('user_id', userId).eq('mes', mes).single(),
    supabase.from('chat_messages')
      .select('role, content')
      .eq('user_id', userId)
      .eq('mes', mes)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const ctx = buildAdvisorContext(mes, transactions, budgets)
  const insights: Insight[] = (cachedInsights?.insights as Insight[]) ?? []
  const historial = (history ?? []).reverse()

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: `${CHAT_SYSTEM_PROMPT}\n\n${buildChatContextBlock(ctx, insights)}` },
    ...historial.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string })),
    { role: 'user', content: message },
  ]

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.4,
    max_tokens: 512,
    messages,
  })

  const response = completion.choices[0]?.message?.content?.trim() ?? ''

  await supabase.from('chat_messages').insert([
    { user_id: userId, mes, role: 'user',      content: message },
    { user_id: userId, mes, role: 'assistant', content: response },
  ])

  return response
}
