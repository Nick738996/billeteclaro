import Groq from 'groq-sdk'
import { startOfMonth, endOfMonth, parseISO } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAdvisorContext, hashContext } from '@/lib/ai/buildAdvisorContext'
import { CATEGORIA_LABELS, isGasto } from '@/lib/types'
import type { Transaction, Insight } from '@/lib/types'

let _groq: Groq | null = null
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _groq
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const INSIGHTS_SYSTEM_PROMPT = `Eres BilleteClaro, asesor financiero personal de colombianos.
Analiza el mes del usuario. Genera máximo 5 insights directos, específicos, siempre con cifras reales en COP.

TIPOS DE INSIGHT:

"alerta" — categoría excedida (gastado >= 100% del presupuesto configurado)
  Formato: "[Categoría] excedida: $X gastados de $Y — te pasaste $Z. [Si hay comercio top: Principal: Comercio $W]"
  NUNCA usar para categorías bajo el 100%. NUNCA usar para categorías sin presupuesto.

"consejo" — acción concreta ejecutable hoy, SOLO para categorías CON presupuesto configurado
  Siempre: verbo imperativo + nombre del comercio o categoría + cifra COP
  Ejemplo: "Solo $X disponibles en Salidas los próximos N días — evita bares y restaurantes costosos"
  NUNCA decir "máximo $0 más" si el presupuesto está agotado: di cuánto se excedió y qué evitar.
  PROHIBIDO para categorías sin presupuesto: no puedes recomendar cancelar ni reducir sin una referencia.

"observacion" — dato relevante sin acción, OBLIGATORIO para categorías sin presupuesto
  Informa el monto y su proporción sobre ingresos o gasto total. Incluye comercio top si está disponible.
  ✓ "$X en Suscripciones sin presupuesto — es el Y% de tus ingresos del mes — top: Netflix $A, Spotify $B"
  ✓ "$X en [Categoría] — top: Comercio $Y (¿lo sigues usando activamente?)"
  ✗ PROHIBIDO: "Cancela [servicio] — ahorras $X/mes" → no sabes qué servicios tiene ni si puede cancelarlos
  ✗ PROHIBIDO: "Deberías reducir tus [gastos]" → no tienes base sin presupuesto de referencia

"positivo" — categoría notablemente bajo presupuesto para los días transcurridos
  Formato: "[Categoría] bajo control: llevas $X de $Y esperado a este punto — vas a cerrar ~$Z bajo presupuesto si mantienes el ritmo"
  NUNCA decir "puedes gastar más". El mensaje es que va bien, no que gaste más.
  Calcula esperado_hoy = (dias_transcurridos / total_dias) * presupuesto_categoria
  Solo aplica si gasto_actual < 60% de esperado_hoy

"proyeccion" — proyección al cierre del mes
  El contexto incluye GASTO_DIARIO_PROMEDIO y PROYECCION_CIERRE ya calculados correctamente.
  DEBES usar esos valores exactos del contexto — NUNCA calcules tu propio ritmo diario.
  Formato: "Al ritmo actual (~$[GASTO_DIARIO_PROMEDIO]/día) cierras el mes en ~$[PROYECCION_CIERRE] — [bajo presupuesto en $Z / sobre presupuesto en $Z]"

REGLAS CRÍTICAS:
- Máximo 5 insights, uno por categoría
- Cada insight: máximo 2 oraciones, nunca sin cifra COP
- Transferencias entre cuentas propias NO son gastos — ignóralas completamente
- Categorías sin presupuesto: usa SOLO "observacion" — nunca "consejo", "alerta" ni "positivo"
- Si el límite restante es $0 o negativo: nunca digas "máximo $0 más" — di el exceso y qué comercio o hábito evitar
- Nunca: "considera", "podrías", "sería recomendable", "te sugerimos", "para evitar exceder"
- Usa los comercios del contexto siempre que refuercen el punto

Responde ÚNICAMENTE con este JSON (sin texto extra):
{"insights": [{"tipo": "alerta|consejo|observacion|positivo|proyeccion", "texto": "...", "categoria": "CATEGORIA_EN_MAYUSCULAS", "limite_sugerido": null}]}`

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

function topMerchantsPerCat(transactions: Transaction[]): Record<string, string> {
  const agg: Record<string, Record<string, number>> = {}
  for (const t of transactions) {
    if (!isGasto(t.tipo, t.categoria) || t.categoria === 'TRANSFERENCIA' || !t.comercio) continue
    if (!agg[t.categoria]) agg[t.categoria] = {}
    agg[t.categoria][t.comercio] = (agg[t.categoria][t.comercio] ?? 0) + t.monto
  }
  const result: Record<string, string> = {}
  for (const [cat, comercios] of Object.entries(agg)) {
    result[cat] = Object.entries(comercios)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([c, m]) => `${c} $${m.toLocaleString('es-CO')}`)
      .join(', ')
  }
  return result
}

function buildInsightsContextPrompt(ctx: ReturnType<typeof buildAdvisorContext>, transactions: Transaction[]): string {
  const diasDelMes = ctx.dias_transcurridos + ctx.dias_restantes
  const pctMes = Math.round((ctx.dias_transcurridos / diasDelMes) * 100)
  const transferencias = ctx.gastos_por_categoria['TRANSFERENCIA' as keyof typeof ctx.gastos_por_categoria] ?? 0
  const gastosReales = ctx.total_gastado - transferencias
  const margenIngreso = ctx.ingreso_estimado > 0 ? ctx.ingreso_estimado - gastosReales : null
  const topMerchants = topMerchantsPerCat(transactions)

  // Top 5 comercios globales del mes
  const globalMerchants: Record<string, number> = {}
  for (const t of transactions) {
    if (!isGasto(t.tipo, t.categoria) || t.categoria === 'TRANSFERENCIA' || !t.comercio) continue
    globalMerchants[t.comercio] = (globalMerchants[t.comercio] ?? 0) + t.monto
  }
  const top5Global = Object.entries(globalMerchants)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([c, m]) => `${c} $${m.toLocaleString('es-CO')}`)
    .join(', ')

  // Frecuencia de transacciones por categoría
  const txCountByCat: Record<string, number> = {}
  for (const t of transactions) {
    if (!isGasto(t.tipo) || t.categoria === 'TRANSFERENCIA') continue
    txCountByCat[t.categoria] = (txCountByCat[t.categoria] ?? 0) + 1
  }

  const conPresupuesto = Object.entries(ctx.presupuesto_por_categoria)
    .filter(([, limite]) => limite > 0)
    .map(([cat, limite]) => {
      const gastado = ctx.gastos_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0
      const pct = Math.round((gastado / limite) * 100)
      const esperadoHoy = Math.round((ctx.dias_transcurridos / diasDelMes) * limite)
      const exceso = gastado - limite
      const estado = pct >= 100 ? `EXCEDIDO en $${exceso.toLocaleString('es-CO')}` : pct >= 80 ? 'CERCA DEL LÍMITE' : 'OK'
      const txCount = txCountByCat[cat] ?? 0
      const merchants = topMerchants[cat] ? ` | top: ${topMerchants[cat]}` : ''
      return `  ${catLabel(cat)}: $${gastado.toLocaleString('es-CO')} / $${limite.toLocaleString('es-CO')} (${pct}% — ${estado}) | esperado hoy: $${esperadoHoy.toLocaleString('es-CO')} | ${txCount} transacciones${merchants}`
    })

  const sinPresupuesto = Object.entries(ctx.gastos_por_categoria)
    .filter(([cat, val]) =>
      cat !== 'TRANSFERENCIA' && val > 0 &&
      (ctx.presupuesto_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0) === 0
    )
    .map(([cat, val]) => {
      const pctDelTotal = gastosReales > 0 ? Math.round((val / gastosReales) * 100) : 0
      const txCount = txCountByCat[cat] ?? 0
      const merchants = topMerchants[cat] ? ` | top: ${topMerchants[cat]}` : ''
      return `  ${catLabel(cat)}: $${val.toLocaleString('es-CO')} (${pctDelTotal}% del gasto total, ${txCount} transacciones, sin presupuesto)${merchants}`
    })

  return `=== RESUMEN DEL MES ===
Mes: ${ctx.mes} | Día ${ctx.dias_transcurridos} de ${diasDelMes} (${pctMes}% transcurrido) | ${ctx.dias_restantes} días restantes
Ingresos del mes: $${ctx.ingreso_estimado.toLocaleString('es-CO')}
Gastos reales (sin transferencias): $${gastosReales.toLocaleString('es-CO')}
${margenIngreso !== null ? `Margen ingreso − gasto: $${margenIngreso.toLocaleString('es-CO')} (${margenIngreso >= 0 ? 'positivo' : 'NEGATIVO'})` : ''}
GASTO_DIARIO_PROMEDIO (usa este valor en el insight de proyección): $${ctx.gasto_diario_promedio.toLocaleString('es-CO')}/día
PROYECCION_CIERRE (usa este valor en el insight de proyección): $${ctx.proyeccion_cierre.toLocaleString('es-CO')}
${transferencias > 0 ? `Transferencias propias (NO analizar como gasto): $${transferencias.toLocaleString('es-CO')}` : ''}
Top 5 comercios del mes: ${top5Global || 'sin datos'}

=== CATEGORÍAS CON PRESUPUESTO ===
${conPresupuesto.length ? conPresupuesto.join('\n') : '  (ninguna configurada)'}

=== CATEGORÍAS SIN PRESUPUESTO ===
${sinPresupuesto.length ? sinPresupuesto.join('\n') : '  (ninguna)'}`
}

function buildChatContextBlock(ctx: ReturnType<typeof buildAdvisorContext>, transactions: Transaction[], insights: Insight[]): string {
  const diasDelMes = ctx.dias_transcurridos + ctx.dias_restantes
  const transferencias = ctx.gastos_por_categoria['TRANSFERENCIA' as keyof typeof ctx.gastos_por_categoria] ?? 0
  const gastosReales = ctx.total_gastado - transferencias
  const topMerchants = topMerchantsPerCat(transactions)

  const conPresupuesto = Object.entries(ctx.presupuesto_por_categoria)
    .filter(([, limite]) => limite > 0)
    .map(([cat, limite]) => {
      const gastado = ctx.gastos_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0
      const merchants = topMerchants[cat] ? ` (${topMerchants[cat]})` : ''
      return `${catLabel(cat)}: $${gastado.toLocaleString('es-CO')}/$${limite.toLocaleString('es-CO')} ${Math.round((gastado / limite) * 100)}%${merchants}`
    }).join(' | ')

  const sinPresupuesto = Object.entries(ctx.gastos_por_categoria)
    .filter(([cat, val]) =>
      cat !== 'TRANSFERENCIA' && val > 0 &&
      (ctx.presupuesto_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0) === 0
    )
    .map(([cat, val]) => {
      const merchants = topMerchants[cat] ? ` (${topMerchants[cat]})` : ''
      return `${catLabel(cat)}: $${val.toLocaleString('es-CO')}${merchants}`
    }).join(' | ')

  return `=== CONTEXTO FINANCIERO ===
Mes: ${ctx.mes} | Día ${ctx.dias_transcurridos} de ${diasDelMes} | Restantes: ${ctx.dias_restantes} días (${ctx.dias_restantes_semana} de semana)
Ingresos: $${ctx.ingreso_estimado.toLocaleString('es-CO')} | Gastos reales: $${gastosReales.toLocaleString('es-CO')} (~$${ctx.gasto_diario_promedio.toLocaleString('es-CO')}/día)
Con presupuesto: ${conPresupuesto || 'ninguno'}
Sin presupuesto: ${sinPresupuesto || 'ninguno'}
${insights.length ? `Insights activos:\n${insights.map(i => `- [${i.tipo}] ${i.texto}`).join('\n')}` : ''}
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

  if (transactions.length === 0) {
    return { insights: [], cached: true }
  }

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

    if (cached && cached.context_hash === hash) {
      return { insights: cached.insights as Insight[], cached: true }
    }
  }

  let completion
  try {
    completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSIGHTS_SYSTEM_PROMPT },
        { role: 'user',   content: `CONTEXTO DEL USUARIO:\n${buildInsightsContextPrompt(ctx, transactions)}` },
      ],
    })
  } catch (e: any) {
    if (e?.status === 429) throw Object.assign(new Error('rate_limit'), { status: 429 })
    throw e
  }

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
    { role: 'system', content: `${CHAT_SYSTEM_PROMPT}\n\n${buildChatContextBlock(ctx, transactions, insights)}` },
    ...historial.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string })),
    { role: 'user', content: message },
  ]

  const completion = await getGroq().chat.completions.create({
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
