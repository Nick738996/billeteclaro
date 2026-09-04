// La ingesta ahora es 100% por reenvío — todo correo que llega pasó por al
// menos una capa de "reenviar" (a veces varias: alguien reenvía un correo
// que ya venía reenviado). Gmail y Outlook insertan un bloque de encabezado
// fijo por cada capa que no aporta nada al contenido de la transacción y le
// resta presupuesto de caracteres al prompt de la IA — se quita
// mecánicamente, sin asumir nada del banco o idioma del correo original.
const GMAIL_FORWARD_HEADER_RE =
  /-{3,}\s*(?:Forwarded message|Mensaje reenviado)\s*-{3,}\s*\n(?:(?:De|From|Date|Sent|Fecha|Subject|Asunto|To|Para|Cc|CC):.*\n?)+/gi

const OUTLOOK_FORWARD_HEADER_RE =
  /_{10,}\s*\n(?:(?:De|From|Enviado|Sent|Para|To|Fecha|Date|Asunto|Subject|CC|Cc):.*\n?)+/gi

// Gmail representa una firma con imagen embebida como "[image: nombre]" en
// la versión de texto plano — puro ruido visual, sin señal.
const SIGNATURE_IMAGE_RE = /\[image:[^\]]*\]/gi

export function cleanForwardedBody(body: string): string {
  return body
    .replace(GMAIL_FORWARD_HEADER_RE, '')
    .replace(OUTLOOK_FORWARD_HEADER_RE, '')
    .replace(SIGNATURE_IMAGE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
