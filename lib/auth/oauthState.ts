// Solo permitimos rutas relativas internas con caracteres seguros (incluye
// query string simple) — evita que un `next` manipulado redirija a un host
// externo (open redirect) al volver del callback de login.
export function sanitizeNextPath(raw: string | null | undefined, fallback: string): string {
  if (raw && /^\/(?!\/|\\)[A-Za-z0-9\-_/]*(?:\?[A-Za-z0-9=&_\-%.]*)?$/.test(raw)) return raw
  return fallback
}
