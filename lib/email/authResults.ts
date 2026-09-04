// Verificación de autenticidad del remitente. La app detecta el banco
// únicamente por el header `From`, que es trivialmente falsificable (SMTP no
// autentica ese header). Como segunda capa, exigimos que el correo haya
// pasado SPF o DKIM (según lo reporta el proveedor) *y* que el dominio que
// realmente firmó/envió el mensaje coincida con el dominio visible en `From`.
//
// Solo exigir "algún dkim=pass/spf=pass en el header" no alcanza: un atacante
// puede registrar su propio dominio, configurarle SPF/DKIM válidos, y mandar
// un correo con ese dominio autenticado mientras pone el `From:` visible como
// el de un banco (email spoofing clásico) — pasaría un chequeo que no valide
// alineación de dominio.
function extractDomain(address: string): string {
  const emailMatch = address.match(/<([^>]+)>/)
  const email = (emailMatch ? emailMatch[1] : address).toLowerCase().trim()
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1)
}

function domainMatches(candidate: string, expected: string): boolean {
  return candidate === expected || candidate.endsWith(`.${expected}`)
}

export function isAuthenticatedSender(authenticationResults: string, fromAddress: string): boolean {
  if (!authenticationResults || !fromAddress) return false

  const fromDomain = extractDomain(fromAddress)
  if (!fromDomain) return false

  // Gmail/Outlook: "dkim=pass header.i=@dominio.com ..." o "header.d=dominio.com"
  const dkimMatch = authenticationResults.match(/dkim=pass[^;]*?header\.(?:i=@|d=)([a-z0-9.-]+)/i)
  if (dkimMatch && domainMatches(dkimMatch[1].toLowerCase(), fromDomain)) return true

  // "spf=pass ... smtp.mailfrom=usuario@dominio.com" o "smtp.helo=dominio.com"
  const spfMatch = authenticationResults.match(/spf=pass[^;]*?smtp\.(?:mailfrom=[^@;]*@|helo=)([a-z0-9.-]+)/i)
  if (spfMatch && domainMatches(spfMatch[1].toLowerCase(), fromDomain)) return true

  return false
}
