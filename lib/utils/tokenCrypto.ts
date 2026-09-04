import crypto from 'crypto'

// Cifra los refresh_token de Gmail/Outlook en reposo. Sin esto, una fuga de
// SUPABASE_SERVICE_ROLE_KEY (o un bug de RLS) da acceso directo al correo
// completo de la víctima, no solo a BilleteClaro.
//
// Requiere TOKEN_ENCRYPTION_KEY en el entorno. Si no está configurada, las
// funciones son no-op (guardan/leen en texto plano) para no romper syncs
// existentes — agregar la variable y reconectar Gmail/Outlook para cifrar.
const ALGO = 'aes-256-gcm'
const PREFIX = 'enc:v1:'

function getKey(): Buffer | null {
  const secret = process.env.TOKEN_ENCRYPTION_KEY
  if (!secret) return null
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptToken(plaintext: string): string {
  const key = getKey()
  if (!key) return plaintext

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptToken(value: string): string
export function decryptToken(value: string | null): string | null
export function decryptToken(value: string | null): string | null {
  if (!value) return value
  if (!value.startsWith(PREFIX)) return value // token legado guardado antes de activar el cifrado

  const key = getKey()
  if (!key) {
    throw new Error('Hay tokens cifrados en la base de datos pero TOKEN_ENCRYPTION_KEY no está configurada.')
  }

  const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const data = raw.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
