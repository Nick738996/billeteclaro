#!/usr/bin/env node
/**
 * BilleteClaro — Setup automatizado
 * Uso: npm run setup
 *
 * Qué hace:
 *  1. Valida que .env.local existe y tiene las variables necesarias
 *  2. Aplica el schema de la base de datos en Supabase
 *  3. Muestra qué falta configurar manualmente
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import pg from 'pg'

const { Client } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Colores de terminal ───────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}
const ok = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`)
const warn = (msg) => console.log(`  ${c.yellow}!${c.reset} ${msg}`)
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`)
const info = (msg) => console.log(`  ${c.cyan}→${c.reset} ${msg}`)
const section = (title) =>
  console.log(`\n${c.bold}${title}${c.reset}\n${'─'.repeat(50)}`)

// ── Cargar variables de entorno ───────────────────────────────────
section('BilleteClaro Setup')

const envPath = resolve(ROOT, '.env.local')
if (!existsSync(envPath)) {
  fail('.env.local no encontrado.')
  info('Copia el archivo de ejemplo y llena las variables:')
  console.log(`\n    cp .env.example .env.local\n`)
  process.exit(1)
}

config({ path: envPath })
ok('.env.local encontrado')

// ── Validar variables requeridas ──────────────────────────────────
section('Verificando variables de entorno')

const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: 'URL del proyecto Supabase',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Anon key de Supabase',
  SUPABASE_SERVICE_ROLE_KEY: 'Service role key de Supabase',
  DATABASE_URL: 'URL de conexión directa a PostgreSQL (Supabase → Settings → Database)',
  GROQ_API_KEY: 'API key de Groq — gratis en console.groq.com',
}

// Opcionales — avisan pero no bloquean el setup
const OPTIONAL = {
  GOOGLE_CLIENT_ID: 'Client ID de Google OAuth (necesario para Gmail sync)',
  GOOGLE_CLIENT_SECRET: 'Client secret de Google OAuth (necesario para Gmail sync)',
}

let missingVars = false
for (const [key, desc] of Object.entries(REQUIRED)) {
  const val = process.env[key]
  if (!val || val.includes('XXXXXXXXXX') || val.includes('[PASSWORD]')) {
    fail(`${key} — ${desc}`)
    missingVars = true
  } else {
    ok(`${key} ${c.gray}(${val.slice(0, 20)}...)${c.reset}`)
  }
}

for (const [key, desc] of Object.entries(OPTIONAL)) {
  const val = process.env[key]
  if (!val) {
    warn(`${key} vacío — ${desc}`)
  } else {
    ok(`${key} ${c.gray}(${val.slice(0, 20)}...)${c.reset}`)
  }
}

if (missingVars) {
  console.log(`\n${c.yellow}Configura las variables obligatorias en .env.local antes de continuar.${c.reset}\n`)
  process.exit(1)
}

// ── Aplicar schema a Supabase ─────────────────────────────────────
section('Aplicando schema a Supabase')

const schemaPath = resolve(ROOT, 'supabase', 'schema.sql')
const sql = readFileSync(schemaPath, 'utf-8')

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
})

try {
  info('Conectando a PostgreSQL...')
  await client.connect()
  ok('Conexión exitosa')

  info('Ejecutando schema.sql...')

  // Quitar líneas de comentario, luego dividir en statements
  const cleanSql = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  let applied = 0
  for (const stmt of statements) {
    try {
      await client.query(stmt)
      applied++
    } catch (err) {
      // "already exists" errors son OK en re-runs (CREATE IF NOT EXISTS)
      if (!err.message.includes('already exists')) {
        warn(`Statement omitido: ${err.message.slice(0, 80)}`)
      }
    }
  }

  ok(`Schema aplicado (${applied} statements)`)
} catch (err) {
  fail(`Error de conexión: ${err.message}`)
  console.log(`\n${c.gray}Verifica que DATABASE_URL en .env.local sea correcto.`)
  console.log(`Supabase → Settings → Database → Connection string → URI (Session mode)${c.reset}\n`)
  process.exit(1)
} finally {
  await client.end()
}

// ── Verificar tablas creadas ──────────────────────────────────────
section('Verificando tablas en Supabase')

const verifyClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

try {
  await verifyClient.connect()
  const { rows } = await verifyClient.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('transactions', 'budgets', 'patrimonio', 'sync_log', 'user_tokens')
    ORDER BY table_name
  `)

  const found = new Set(rows.map((r) => r.table_name))
  const expected = ['budgets', 'patrimonio', 'sync_log', 'transactions', 'user_tokens']

  for (const table of expected) {
    if (found.has(table)) {
      ok(`Tabla '${table}'`)
    } else {
      fail(`Tabla '${table}' no encontrada`)
    }
  }
} catch (err) {
  warn(`No se pudieron verificar las tablas: ${err.message}`)
} finally {
  await verifyClient.end()
}

// ── Pasos manuales restantes ──────────────────────────────────────
section('Pasos manuales que faltan')

console.log(`
  ${c.bold}1. Google Cloud Console${c.reset}
     ${c.cyan}https://console.cloud.google.com${c.reset}
     • Crea un proyecto (o usa uno existente)
     • APIs & Services → Library → habilita "Gmail API"
     • APIs & Services → Credentials → Create OAuth client ID
       - Application type: Web application
       - Authorized redirect URIs:
         ${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback
         http://localhost:3000/api/auth/callback  (para dev)
     • Copia Client ID y Client Secret → .env.local

  ${c.bold}2. Supabase Auth — Proveedor Google${c.reset}
     ${c.cyan}${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '')}/auth/providers${c.reset}
     • Authentication → Providers → Google
     • Pega el Client ID y Client Secret de Google
     • Activa el proveedor

  ${c.bold}3. Iconos PWA${c.reset} (opcional pero recomendado)
     Agrega tus íconos en:
       public/icons/icon-192.png
       public/icons/icon-512.png

  ${c.bold}4. Correr la app${c.reset}
     ${c.green}npm run dev${c.reset}
`)

console.log(`${c.green}${c.bold}Setup completo.${c.reset} La base de datos está lista.\n`)
