import PostalMime from 'postal-mime'

// No todos los correos traen una parte text/plain (multipart/alternative) —
// algunos templates de banco son solo HTML. Los parsers de lib/parsers/
// buscan etiquetas en texto plano (ej. "Comercio", "Monto transferido"), así
// que sin esto el body les llegaría como HTML crudo (<style>, <meta>, CSS…)
// y ninguna extracción encontraría nada. Espejo de stripHtml() en
// lib/email/bankSenders.ts — duplicado a propósito: el Worker corre en el
// runtime de Cloudflare, aislado del resto de la app (ver package.json de
// este directorio, sin acceso a lib/).
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&uuml;/g, 'ü')
    .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s{2,}/g, ' ')
    .trim()
}

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

    // `message.from` es el remitente de SOBRE SMTP, no el header "De:" que se
    // ve al leer el correo — para reenvío automático por filtro de Gmail
    // ("Forward it to"), Gmail reescribe el sobre a una dirección propia con
    // formato "usuario+caf_=...@gmail.com" (Confirmed Auto-Forward, para
    // manejo de rebotes/SPF) aunque el header "De:" siga mostrando el
    // remitente real (ej. noreply@rappipay.co). `parsed.from` (postal-mime)
    // sí refleja ese header real — con reenvío manual, el header "De:" pasa a
    // ser el del usuario, que es exactamente lo que necesita el fallback de
    // detección por cuerpo en detectBankFromForwardedEmail().
    const payload = {
      token,
      from: parsed.from?.address || message.from,
      subject: parsed.subject ?? '',
      date: parsed.date ?? new Date().toISOString(),
      body: parsed.text || (parsed.html ? stripHtml(parsed.html) : ''),
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
