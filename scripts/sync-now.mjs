#!/usr/bin/env node
/**
 * sync-now.mjs — Corre el sync de Gmail directamente sin sesión HTTP.
 * Uso: node scripts/sync-now.mjs
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { format } from 'date-fns'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan variables de entorno. Revisa .env.local')
  process.exit(1)
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Detección de banco ──────────────────────────────────────────────
const BANK_SENDERS = {
  'noreply@rappicard.co': 'RAPPICARD',
  'noreply@rappipay.co': 'RAPPIPAY',
  'noreply@holdingrappipay.co': 'RAPPIPAY',
}

function detectBank(fromHeader) {
  const m = fromHeader.match(/<([^>]+)>/)
  const email = (m ? m[1] : fromHeader).toLowerCase().trim()
  return BANK_SENDERS[email] ?? 'OTRO'
}

// ── Parser Rappi ────────────────────────────────────────────────────
function isTransactionEmail(subject, body) {
  const keywords = ['compra', 'compraste', 'realizaste', 'transacción', 'pago',
    'transferencia', 'retiro', 'cargo', 'abono', 'cobro']
  const text = (subject + ' ' + body).toLowerCase()
  return keywords.some(k => text.includes(k))
}

function extractAmount(body) {
  const patterns = [
    /\$\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,]\d{2})?)/,
    /COP\s*([\d]{1,3}(?:[.,][\d]{3})*)/i,
    /valor[:\s]+([\d]{1,3}(?:[.,][\d]{3})*)/i,
    /monto[:\s]+([\d]{1,3}(?:[.,][\d]{3})*)/i,
  ]
  for (const p of patterns) {
    const m = body.match(p)
    if (m) {
      const cleaned = m[1].replace(/\./g, '').replace(/,/g, '')
      const num = parseInt(cleaned, 10)
      if (!isNaN(num) && num > 0) return num
    }
  }
  return null
}

function extractMerchant(body) {
  const patterns = [
    /en\s+([A-Z][A-Za-z0-9\s\-&.]+?)(?:\s+con|\s+por|\s*\n|\s*\r|$)/,
    /establecimiento[:\s]+([A-Za-z0-9\s\-&.]+?)(?:\n|\r|$)/i,
    /comercio[:\s]+([A-Za-z0-9\s\-&.]+?)(?:\n|\r|$)/i,
    /compra\s+en\s+([A-Za-z0-9\s\-&.]+?)(?:\n|\r|$)/i,
    /en\s+([A-Za-z0-9\s\-&.À-ÿ]+?)(?:\s+por\s+\$|\s*\n|$)/i,
  ]
  for (const p of patterns) {
    const m = body.match(p)
    if (m) return m[1].trim().slice(0, 100)
  }
  return null
}

function detectTipo(subject, body) {
  const text = (subject + ' ' + body).toLowerCase()
  if (text.includes('transferencia') && text.includes('enviaste')) return 'TRANSFERENCIA_ENVIADA'
  if (text.includes('transferencia') && text.includes('recibiste')) return 'TRANSFERENCIA_RECIBIDA'
  if (text.includes('retiro')) return 'RETIRO'
  if (text.includes('pago') && (text.includes('servicio') || text.includes('factura'))) return 'PAGO_SERVICIO'
  if (text.includes('abono') || text.includes('pago a tarjeta')) return 'ABONO_DEUDA'
  if (text.includes('nómina') || text.includes('nomina') || text.includes('ingreso')) return 'INGRESO'
  return 'COMPRA'
}

function guessCategoria(comercio) {
  const c = (comercio || '').toLowerCase()
  if (/uber|cabify|didi|indriver|taxi|transmilenio|sitp|gasolina/.test(c)) return 'TRANSPORTE'
  if (/rappi|domicilio|delivery|restaurante|cafe|café|bar|club|cine|evento/.test(c)) return 'SALIDAS'
  if (/farmacia|drogueria|droguería|médico|medico|clinic|hospital|gym|gimnasio/.test(c)) return 'SALUD'
  if (/netflix|spotify|disney|hbo|prime|apple|claude|adobe|microsoft/.test(c)) return 'SUSCRIPCIONES'
  if (/temu|amazon|mercadolibre|shein|falabella|éxito|exito|alkosto/.test(c)) return 'COMPRAS_ONLINE'
  if (/claro|movistar|tigo|etb|epm|codensa|gases/.test(c)) return 'HOGAR'
  if (/cdt|fondo|inversión|inversion|bóveda|boveda|bolsa|crypto/.test(c)) return 'INVERSION'
  return 'OTRO'
}

function parseRappi(email) {
  const { body, subject, date, from } = email
  if (!isTransactionEmail(subject, body)) return null
  const monto = extractAmount(body)
  if (!monto) return null
  const comercio = extractMerchant(body)
  const tipo = detectTipo(subject, body)
  const label = from.includes('rappipay') || from.includes('holdingrappipay') ? 'RappiPay' : 'RappiCard'
  let fecha
  try { fecha = new Date(date).toISOString() } catch { fecha = new Date().toISOString() }
  return {
    fecha,
    monto,
    comercio,
    descripcion: comercio ? `${comercio} — ${label}` : `Transacción ${label}`,
    tipo,
    categoria: tipo === 'INGRESO' ? 'INGRESO'
      : tipo === 'TRANSFERENCIA_ENVIADA' || tipo === 'TRANSFERENCIA_RECIBIDA' ? 'TRANSFERENCIA'
        : guessCategoria(comercio ?? ''),
    subcategoria: null,
    moneda: 'COP',
    monto_usd: null,
    flags: [],
  }
}

// ── Extracción del body del email ───────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ').trim()
}

function findPart(parts, mimeType) {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data)
      return Buffer.from(part.body.data, 'base64url').toString('utf-8')
    if (part.parts) {
      const found = findPart(part.parts, mimeType)
      if (found) return found
    }
  }
  return null
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64url').toString('utf-8')
    return payload.mimeType === 'text/html' ? stripHtml(decoded) : decoded
  }
  if (!payload.parts) return ''
  const plain = findPart(payload.parts, 'text/plain')
  if (plain) return plain
  const html = findPart(payload.parts, 'text/html')
  if (html) return stripHtml(html)
  return ''
}

// ── Gmail helpers ───────────────────────────────────────────────────
const SEARCH_QUERY = [
  'from:noreply@rappicard.co',
  'from:noreply@rappipay.co',
  'from:noreply@holdingrappipay.co',
].join(' OR ')

async function listAllMessageIds(gmail) {
  const query = `{${SEARCH_QUERY}} newer_than:365d`
  const ids = []
  let pageToken

  do {
    const res = await gmail.users.messages.list({
      userId: 'me', q: query, maxResults: 500, pageToken,
    })
    const messages = res.data.messages ?? []
    ids.push(...messages.map(m => m.id))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken && ids.length < 5000)

  return ids
}

async function getMessageDetails(gmail, messageId) {
  const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
  const msg = res.data
  const headers = msg.payload?.headers ?? []
  const getHeader = name => headers.find(h => h.name?.toLowerCase() === name)?.value ?? ''
  return {
    id: messageId,
    from: getHeader('from'),
    subject: getHeader('subject'),
    date: getHeader('date'),
    body: extractBody(msg.payload),
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function runSync(userId, tokenRow) {
  console.log(`\n▶ Iniciando sync para usuario ${userId}`)

  // Refresh Gmail access token
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: tokenRow.gmail_refresh_token })
  const { credentials } = await oauth2.refreshAccessToken()
  const accessToken = credentials.access_token

  // Update stored token
  await admin.from('user_tokens').update({
    gmail_access_token: accessToken,
    token_expires_at: new Date(credentials.expiry_date ?? Date.now() + 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth })

  // Get all Rappi email IDs
  console.log('  Buscando correos de Rappi (últimos 365 días)...')
  const allIds = await listAllMessageIds(gmail)
  console.log(`  Encontrados: ${allIds.length} correos`)

  // Filter already processed
  const { data: existing } = await admin
    .from('transactions')
    .select('gmail_message_id')
    .eq('user_id', userId)
    .in('gmail_message_id', allIds)

  const processedIds = new Set((existing ?? []).map(r => r.gmail_message_id))
  const newIds = allIds.filter(id => !processedIds.has(id))
  console.log(`  Nuevos por procesar: ${newIds.length}`)

  if (newIds.length === 0) {
    console.log('  ✓ Todo al día, nada nuevo que procesar.')
    return { revisados: 0, nuevas: 0, errores: [] }
  }

  // Process in batches of 10
  const BATCH = 10
  let nuevas = 0
  const errores = []

  for (let i = 0; i < newIds.length; i += BATCH) {
    const batch = newIds.slice(i, i + BATCH)
    process.stdout.write(`  Procesando ${Math.min(i + BATCH, newIds.length)}/${newIds.length}...\r`)

    const details = await Promise.allSettled(batch.map(id => getMessageDetails(gmail, id)))

    const rows = []
    for (const result of details) {
      if (result.status === 'rejected') {
        errores.push(`Fetch error: ${result.reason}`)
        continue
      }
      const email = result.value
      const banco = detectBank(email.from)
      if (banco === 'OTRO') continue

      const parsed = parseRappi({ ...email, banco })
      if (!parsed) continue

      const fecha = parsed.fecha ? new Date(parsed.fecha) : new Date()
      rows.push({
        user_id: userId,
        gmail_message_id: email.id,
        fecha: fecha.toISOString(),
        monto: parsed.monto,
        comercio: parsed.comercio,
        descripcion: parsed.descripcion,
        banco,
        tipo: parsed.tipo,
        categoria: parsed.categoria,
        subcategoria: parsed.subcategoria,
        id_auditoria: null,
        moneda: parsed.moneda,
        monto_usd: parsed.monto_usd,
        flags: parsed.flags,
        raw_snippet: null,
        procesado: true,
      })
    }

    if (rows.length > 0) {
      const { error, data: inserted } = await admin
        .from('transactions')
        .upsert(rows, { onConflict: 'user_id,gmail_message_id', ignoreDuplicates: true })
        .select('id')
      if (error) errores.push(`Insert error: ${error.message}`)
      else nuevas += inserted?.length ?? 0
    }
  }

  console.log(`\n  ✓ Revisados: ${newIds.length} | Nuevas transacciones: ${nuevas} | Errores: ${errores.length}`)
  if (errores.length > 0) errores.forEach(e => console.error('  ⚠', e))
  return { revisados: newIds.length, nuevas, errores }
}

async function main() {
  console.log('BilleteClaro — Sync directo\n')

  // Get all users with Gmail tokens
  const { data: tokens, error } = await admin
    .from('user_tokens')
    .select('user_id, gmail_refresh_token')
    .not('gmail_refresh_token', 'is', null)

  if (error) { console.error('Error leyendo user_tokens:', error.message); process.exit(1) }
  if (!tokens?.length) { console.log('No hay usuarios con token de Gmail.'); process.exit(0) }

  console.log(`Usuarios a sincronizar: ${tokens.length}`)

  for (const row of tokens) {
    try {
      await runSync(row.user_id, row)
    } catch (err) {
      console.error(`Error en sync para ${row.user_id}:`, err.message)
    }
  }

  console.log('\n✅ Sync completo.')
}

main().catch(err => { console.error(err); process.exit(1) })
