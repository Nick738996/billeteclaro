import { ok, err } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { processForwardedEmail, type ForwardedEmailPayload } from '@/lib/services/forwardingService'

// Ruta pública — no usa withAuth porque quien llama es el Worker de Cloudflare
// Email Routing, no un usuario con sesión de Supabase. La autenticidad se
// valida con un secreto compartido en vez de una sesión.
export async function POST(req: Request) {
  if (req.headers.get('x-forward-secret') !== process.env.FORWARD_INGEST_SECRET) {
    return err('unauthorized', 401)
  }

  let payload: ForwardedEmailPayload
  try {
    payload = await req.json()
  } catch {
    return err('invalid payload', 400)
  }

  if (!payload.token || !payload.from || !payload.body) {
    return err('missing fields', 400)
  }

  try {
    const result = await processForwardedEmail(payload, createAdminClient())
    return ok(result)
  } catch (e) {
    console.error('[POST /api/ingest/forward]', e)
    return err('Error procesando correo reenviado')
  }
}
