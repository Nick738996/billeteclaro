import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { sendChatMessage } from '@/lib/services/advisorService'

// POST /api/ai/chat  body: { message: string, mes: string }
export const POST = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { message?: string; mes?: string }
  const { message, mes } = body

  if (!message?.trim() || !mes) return err('message y mes son requeridos', 400)

  try {
    const response = await sendChatMessage(supabase, user.id, mes, message.trim())
    return ok({ response })
  } catch (e) {
    console.error('[POST /api/ai/chat]', { userId: user.id, mes }, e)
    return err('Error generando respuesta')
  }
})
