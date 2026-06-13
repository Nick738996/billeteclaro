import Groq from 'groq-sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAdvisorContext, hashContext } from '@/lib/ai/buildAdvisorContext'
import { CATEGORIA_LABELS, isGasto } from '@/lib/types'
import type { Transaction, Insight, AdvisorContext } from '@/lib/types'

let _groq: Groq | null = null
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _groq
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const INSIGHTS_SYSTEM_PROMPT = `Eres el asesor financiero personal de un colombiano. Tienes sus datos reales de este mes.
Genera exactamente 5 insights que SOLO TÚ podrías dar porque tienes sus números reales.

═══════════════════════════════
TEST DEL ESPEJO (aplicar a cada insight)
═══════════════════════════════
"¿Podría cualquier app decir esto sin ver los datos del usuario?"
Si SÍ → inválido. Reescríbelo con sus números reales del contexto.

═══════════════════════════════
FORMATO DE MONEDA — Colombia
═══════════════════════════════
✓ $45.000 / $1.200.000 / $3.5M / $450K
✗ $45,000.00 / $1.200.000,00

═══════════════════════════════
NÚMEROS — SOLO del contexto JSON
═══════════════════════════════
NUNCA calcules tú mismo. Usa directamente:
→ gasto_diario_promedio (ritmo actual)
→ proyeccion_cierre (cierre del mes)
→ exceso_proyectado (cuánto te pasas o ahorras)
→ porcentaje_mes_transcurrido (% del mes)
→ top_3_gastos[].comercio (nombres reales)
→ top_categoria_excedida (categoría más crítica)

═══════════════════════════════
TIPOS — reglas estrictas
═══════════════════════════════
"alerta" → SOLO si categorias_excedidas no está vacío
  ✓ "Te pasaste $[exceso] en [cat] — [top_comercio] fue $[monto]. Quedan [dias] días sin más [cat]."
  limite_sugerido: presupuesto original de esa categoría

"consejo" → acción concreta ejecutable HOY con número exacto
  ✓ "Para cerrar [cat] dentro del límite: máximo $[presupuesto-gasto] más este mes"
  limite_sugerido: presupuesto - gasto_actual (lo que puede gastar aún)

"positivo" → solo si gasto_categoria < presupuesto_categoria * (porcentaje_mes_transcurrido/100)
  ✓ "[Cat] al [X]% con [porcentaje_mes]% del mes — $[Z] disponibles esta semana"
  Z = (presupuesto - gasto) / dias_restantes * 7
  limite_sugerido: null

"proyeccion" → SIEMPRE usa proyeccion_cierre y exceso_proyectado del contexto
  ✓ "Al ritmo de $[gasto_diario_promedio]/día, cierras [mes] en $[proyeccion_cierre] — [sobre/bajo] presupuesto en $[abs(exceso_proyectado)]"
  limite_sugerido: null

"observacion" → categorias_sin_presupuesto con gasto > 5% del total
  ✓ "$[monto] en [cat] ([X]% del gasto total) — top: [comercio] $[monto]"
  Para Suscripciones: ✓ "$[monto] en Suscripciones — ¿sabes cuáles sigues usando?"
  NUNCA: "considera cancelar / reducir / revisar"
  limite_sugerido: null

═══════════════════════════════
PRIORIDAD DE LOS 5 INSIGHTS
═══════════════════════════════
1. alerta (top_categoria_excedida, si existe)
2. proyeccion del mes
3. positivo (mejor categoría controlada)
4. consejo o segunda alerta
5. observacion (categoría sin presupuesto más relevante)

═══════════════════════════════
PROHIBIDO absolutamente
═══════════════════════════════
"Considera..." / "Podrías..." / "Sería bueno..." / "Deberías..."
Dos insights sobre la misma categoría
Números que no están en el contexto
Transferencias entre cuentas propias (ignóralas completamente)

Responde ÚNICAMENTE con JSON válido, sin texto antes ni después:
{"insights":[{"tipo":"...","texto":"...","categoria":"...","limite_sugerido":null}]}`

function buildChatSystemPrompt(ctx: AdvisorContext): string {
  const topComerciosStr = ctx.top_3_gastos
    .map(t => `${t.comercio} $${t.monto.toLocaleString('es-CO')}`)
    .join(', ') || 'sin datos'
  return `Eres el asesor financiero personal de este colombiano. Modo conversacional.

DATOS DE SU MES:
- Gasto diario promedio: $${ctx.gasto_diario_promedio.toLocaleString('es-CO')}
- Días restantes: ${ctx.dias_restantes}
- Proyección de cierre: $${ctx.proyeccion_cierre.toLocaleString('es-CO')}
- Top comercios: ${topComerciosStr}

REGLAS:
1. Máximo 2-3 oraciones. Nunca párrafos.
2. Siempre con al menos un número de sus datos reales.
3. Nombra sus comercios reales ("tus Ubers", "los pedidos de Rappi").
4. Límites por tiempo:
   - finde: (presupuesto_cat - gasto_cat) / dias_restantes * 3
   - semana: (presupuesto_cat - gasto_cat) / dias_restantes * 7
   - hoy: (total_presupuestado - total_gastado) / dias_restantes
5. Si no tienes el dato exacto: "No tengo ese dato este mes."
6. Tono: directo, colombiano. Puedes usar "ojo que", "de una", "parce".
NUNCA: "considera", "podrías", "sería bueno".`
}

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

function buildInsightsContextPrompt(ctx: AdvisorContext, transactions: Transaction[]): string {
  const transferencias = (ctx.gastos_por_categoria as Record<string, number>)['TRANSFERENCIA'] ?? 0
  const gastosReales = ctx.total_gastado - transferencias
  const topMerchants = topMerchantsPerCat(transactions)

  const conPresupuesto = Object.entries(ctx.presupuesto_por_categoria)
    .filter(([, limite]) => limite > 0)
    .map(([cat, limite]) => {
      const gastado = (ctx.gastos_por_categoria as Record<string, number>)[cat] ?? 0
      const pct = Math.round(gastado / limite * 100)
      const esperadoHoy = Math.round(ctx.porcentaje_mes_transcurrido / 100 * limite)
      const estado = gastado > limite
        ? `EXCEDIDO en $${(gastado - limite).toLocaleString('es-CO')}`
        : pct >= 80 ? 'EN RIESGO' : 'OK'
      const merchants = topMerchants[cat] ? ` | top: ${topMerchants[cat]}` : ''
      return `  ${catLabel(cat)}: gastado=$${gastado.toLocaleString('es-CO')} presupuesto=$${limite.toLocaleString('es-CO')} (${pct}% — ${estado}) esperado_hoy=$${esperadoHoy.toLocaleString('es-CO')}${merchants}`
    })

  const sinPresupuesto = Object.entries(ctx.gastos_por_categoria)
    .filter(([cat, val]) =>
      cat !== 'TRANSFERENCIA' && val > 0 &&
      ((ctx.presupuesto_por_categoria as Record<string, number>)[cat] ?? 0) === 0
    )
    .map(([cat, val]) => {
      const pct = gastosReales > 0 ? Math.round(val / gastosReales * 100) : 0
      const merchants = topMerchants[cat] ? ` | top: ${topMerchants[cat]}` : ''
      return `  ${catLabel(cat)}: $${val.toLocaleString('es-CO')} (${pct}% del gasto total, sin presupuesto)${merchants}`
    })

  const ctxJson = JSON.stringify({
    mes: ctx.mes,
    porcentaje_mes_transcurrido: ctx.porcentaje_mes_transcurrido,
    dias_transcurridos: ctx.dias_transcurridos,
    dias_restantes: ctx.dias_restantes,
    dias_totales_mes: ctx.dias_totales_mes,
    ingreso_estimado: ctx.ingreso_estimado,
    gasto_diario_promedio: ctx.gasto_diario_promedio,
    proyeccion_cierre: ctx.proyeccion_cierre,
    exceso_proyectado: ctx.exceso_proyectado,
    gasto_esperado_a_esta_fecha: ctx.gasto_esperado_a_esta_fecha,
    diferencia_vs_esperado: ctx.diferencia_vs_esperado,
    categorias_excedidas: ctx.categorias_excedidas,
    categorias_en_riesgo: ctx.categorias_en_riesgo,
    categorias_sin_presupuesto: ctx.categorias_sin_presupuesto,
    top_3_gastos: ctx.top_3_gastos,
    top_categoria_excedida: ctx.top_categoria_excedida,
  }, null, 2)

  return `=== CONTEXTO JSON (usa estos valores exactos) ===
${ctxJson}

=== DETALLE POR CATEGORÍA ===
Gastos reales (excluye transferencias entre cuentas): $${gastosReales.toLocaleString('es-CO')}
${transferencias > 0 ? `Transferencias propias (NO analizar): $${transferencias.toLocaleString('es-CO')}` : ''}

Con presupuesto:
${conPresupuesto.length ? conPresupuesto.join('\n') : '  (ninguna configurada)'}

Sin presupuesto:
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
  const [{ data: txData }, { data: budgetData }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('mes_contable', mes),
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

  console.log('[ADVISOR AUDIT] ' + JSON.stringify({
    mes: ctx.mes,
    porcentaje_mes: ctx.porcentaje_mes_transcurrido + '%',
    total_gastado: ctx.total_gastado,
    gasto_diario_promedio: ctx.gasto_diario_promedio,
    proyeccion_cierre: ctx.proyeccion_cierre,
    exceso_proyectado: ctx.exceso_proyectado,
    categorias_excedidas: ctx.categorias_excedidas,
    top_3_gastos: ctx.top_3_gastos.map(t => `${t.comercio}: $${t.monto}`),
    top_categoria_excedida: ctx.top_categoria_excedida?.categoria ?? 'ninguna',
  }))

  // Cache hit: mismo hash
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
  let insights: Insight[] = []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed.insights)) insights = parsed.insights
  } catch {
    console.error('[ADVISOR] JSON.parse failed:', text)
  }

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
    { role: 'system', content: `${buildChatSystemPrompt(ctx)}\n\n${buildChatContextBlock(ctx, transactions, insights)}` },
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
