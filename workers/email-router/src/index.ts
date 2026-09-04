import PostalMime from 'postal-mime'

export interface Env {
  // Secreto compartido con /api/ingest/forward — configurar con:
  // wrangler secret put FORWARD_INGEST_SECRET
  FORWARD_INGEST_SECRET: string
  // URL completa de la ruta de ingesta, ej. https://billeteclaro.com/api/ingest/forward
  INGEST_URL: string
  // Solo necesario mientras INGEST_URL apunta a un preview de Vercel (que
  // por defecto bloquea acceso público) — en producción Vercel lo ignora si
  // no hace falta, así que es seguro dejarlo siempre configurado.
  // wrangler secret put VERCEL_PROTECTION_BYPASS
  VERCEL_PROTECTION_BYPASS?: string
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    // El local-part de la dirección a la que llegó el correo ES el token
    // (ver lib/services/forwardingService.ts::generateForwardingToken) —
    // ej. u_a1b2c3d4e5f6@billeteclaro.com → token = u_a1b2c3d4e5f6
    const token = message.to.split('@')[0]

    let parsed
    try {
      const raw = await new Response(message.raw).arrayBuffer()
      parsed = await PostalMime.parse(raw)
    } catch (err) {
      console.error('[email-router] error parseando MIME:', err)
      return
    }

    const payload = {
      token,
      from: message.from,
      subject: parsed.subject ?? '',
      date: parsed.date ?? new Date().toISOString(),
      body: parsed.text || parsed.html || '',
      messageId: parsed.messageId ?? null,
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Forward-Secret': env.FORWARD_INGEST_SECRET,
      }
      if (env.VERCEL_PROTECTION_BYPASS) {
        headers['x-vercel-protection-bypass'] = env.VERCEL_PROTECTION_BYPASS
      }
      const res = await fetch(env.INGEST_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const text = await res.text()
      if (!res.ok) {
        console.error('[email-router] ingest falló:', res.status, text)
      } else {
        console.log('[email-router] ingest ok:', text)
      }
    } catch (err) {
      console.error('[email-router] error llamando a la ruta de ingesta:', err)
    }
  },
}
