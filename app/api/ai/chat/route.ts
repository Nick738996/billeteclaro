import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { getAuthUser } from '@/lib/supabase/server'
import { buildAdvisorContext } from '@/lib/ai/buildAdvisorContext'
import type { Transaction, Insight } from '@/lib/types'
import { CATEGORIA_LABELS } from '@/lib/types'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const SYSTEM_PROMPT = `Eres BilleteClaro, el asesor financiero personal de colombianos.
Hablas como un amigo contador: directo, sin rodeos, con números concretos en pesos colombianos.
Estás en modo conversacional. El usuario puede preguntarte sobre sus finanzas.
Tienes acceso al contexto completo de su mes: gastos, presupuestos y días restantes.
Responde máximo en 3 oraciones. Si el usuario pregunta por un límite concreto (finde, semana), calcula con los datos del contexto.
Nada de perogrulladas — siempre con cifras específicas.`

function label(cat: string): string {
  return CATEGORIA_LABELS[cat as keyof typeof CATEGORIA_LABELS] ?? cat
}

function buildContextBlock(ctx: ReturnType<typeof buildAdvisorContext>, insights: Insight[]): string {
  const diasDelMes = ctx.dias_transcurridos + ctx.dias_restantes
  const transferencias = ctx.gastos_por_categoria['TRANSFERENCIA' as keyof typeof ctx.gastos_por_categoria] ?? 0
  const gastosReales = ctx.total_gastado - transferencias

  const conPresupuesto = Object.entries(ctx.presupuesto_por_categoria)
    .filter(([, limite]) => limite > 0)
    .map(([cat, limite]) => {
      const gastado = ctx.gastos_por_categoria[cat as keyof typeof ctx.gastos_por_categoria] ?? 0
      const pct = Math.round((gastado / limite) * 100)
      return `${label(cat)}: $${gastado.toLocaleString('es-CO')} / $${limite.toLocaleString('es-CO')} (${pct}%)`
    }).join(' | ')

  const sinPresupuesto = Object.entries(ctx.gastos_por_categoria)
    .filter(([cat, val]) =>
      cat !== 'TRANSFERENCIA' && val > 0 &&
      (ctx.presupuesto_por_categoria[cat as keyof typeof ctx.presupuesto_por_categoria] ?? 0) === 0
    )
    .map(([cat, val]) => `${label(cat)}: $${val.toLocaleString('es-CO')}`)
    .join(' | ')

  const insightTexts = insights.map(i => `- [${i.tipo}] ${i.texto}`).join('\n')

  return `=== CONTEXTO FINANCIERO ===
Mes: ${ctx.mes} | Día ${ctx.dias_transcurridos} de ${diasDelMes} | Restantes: ${ctx.dias_restantes} días (${ctx.dias_restantes_semana} de semana)
Ingresos: $${ctx.ingreso_estimado.toLocaleString('es-CO')} | Gastos reales: $${gastosReales.toLocaleString('es-CO')}
Con presupuesto: ${conPresupuesto || 'ninguno'}
Sin presupuesto: ${sinPresupuesto || 'ninguno'}
${insightTexts ? `Insights: \n${insightTexts}` : ''}
===========================`
}

// POST /api/ai/chat  body: { message: string, mes: string }
export async function POST(request: Request) {
  const { user, supabase } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, mes } = await request.json() as { message: string; mes: string }
  if (!message?.trim() || !mes) {
    return NextResponse.json({ error: 'message y mes son requeridos' }, { status: 400 })
  }

  // Cargar transacciones del mes
  const ref = parseISO(`${mes}-01`)
  const { data: txData } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .gte('fecha', startOfMonth(ref).toISOString())
    .lte('fecha', endOfMonth(ref).toISOString())

  const transactions = (txData ?? []) as Transaction[]

  // Cargar presupuestos
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

  // Cargar insights en caché para incluir en el contexto
  const { data: cachedInsights } = await supabase
    .from('ai_insights')
    .select('insights')
    .eq('user_id', user.id)
    .eq('mes', mes)
    .single()

  const insights: Insight[] = (cachedInsights?.insights as Insight[]) ?? []

  // Cargar historial de chat (últimos 10 mensajes)
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', user.id)
    .eq('mes', mes)
    .order('created_at', { ascending: false })
    .limit(10)

  const historialOrdenado = (history ?? []).reverse()

  // Construir mensajes con historial
  const contextBlock = buildContextBlock(ctx, insights)
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
    ...historialOrdenado.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    })),
    { role: 'user', content: message.trim() },
  ]

  // Llamar a Groq
  let response = ''
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 512,
      messages,
    })
    response = completion.choices[0]?.message?.content?.trim() ?? ''
  } catch (err) {
    console.error('[ai/chat] Groq error:', err)
    return NextResponse.json({ error: 'Error generando respuesta' }, { status: 500 })
  }

  // Guardar mensaje del usuario y respuesta
  await supabase.from('chat_messages').insert([
    { user_id: user.id, mes, role: 'user',      content: message.trim() },
    { user_id: user.id, mes, role: 'assistant', content: response },
  ])

  return NextResponse.json({ response })
}
