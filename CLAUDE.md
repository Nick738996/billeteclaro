# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Producto

**BilleteClaro** — PWA de finanzas personales para Colombia. Lee automáticamente correos de notificación de bancos desde Gmail, extrae cada transacción con parsers específicos + IA como fallback, y presenta un dashboard financiero. El usuario no hace nada manualmente.

- Dominio objetivo: `billeteclaro.app`
- Mercado: Colombia (MVP)
- Supabase project ref: `txfnesqouciiiklhsjaw` (us-east-1)

## Comandos

```bash
npm run dev        # servidor local en :3000
npm run build      # build de producción
npm run setup      # aplica schema.sql a Supabase + valida env vars
npx tsc --noEmit   # type check (no hay test runner configurado aún)
```

El setup script (`scripts/setup.mjs`) valida `.env.local`, conecta vía `DATABASE_URL` al Supabase Pooler y ejecuta `supabase/schema.sql`. Requiere todas las variables de `REQUIRED` para continuar; `GOOGLE_CLIENT_ID/SECRET` son opcionales (solo advierten).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 App Router |
| Base de datos | Supabase (PostgreSQL, us-east-1) |
| Auth | Supabase Auth + Google OAuth |
| Email | Gmail API v1 (`gmail.readonly`) |
| IA / extracción | Groq API — modelo `llama-3.3-70b-versatile` |
| UI | Tailwind CSS + Recharts (PieChart) |
| PWA | @ducanh2912/next-pwa (deshabilitado en dev) |

## Arquitectura del pipeline de sync

El flujo completo vive en `app/api/sync/route.ts` (POST):

```
Gmail OAuth refresh → listBankMessageIds() → filtrar ya procesados
→ por cada email nuevo:
    trySpecificParser(banco, email)  ← rápido, sin costo
    └─ null → extractWithGroq()      ← fallback IA, concurrencia=3
→ upsert en transactions (dedup por gmail_message_id UNIQUE)
→ actualizar sync_log
```

**Deduplicación:** constraint `UNIQUE(user_id, gmail_message_id)` en la BD. El upsert usa `ignoreDuplicates: true`. Re-sincronizar es seguro.

**Límites:** máx 100 emails por sync (`MAX_EMAILS_PER_SYNC`), búsqueda últimos 90 días, paginación hasta 2000 mensajes.

## Detección de bancos (`lib/gmail/client.ts`)

El banco se detecta por el header `From` del email **antes** de parsear:

| Email sender | Banco |
|---|---|
| `noreply@rappicard.co` | RAPPICARD |
| `noreply@rappipay.co` | RAPPICARD ← **pendiente separar como RAPPIPAY** |
| `noreply@holdingrappipay.co` | RAPPICARD |
| `alertas@notificacionesbancolombia.com` | BANCOLOMBIA |
| `alertas@bancolombia.com.co` | BANCOLOMBIA |
| `no-reply@nu.com.co` | NU |
| `notificaciones@nu.com.co` | NU |
| `*@nequi.com.co` | NEQUI |
| `*@daviplata.com` | DAVIPLATA |
| `*@bbva.com.co` | BBVA |
| `*@davivienda.com` | DAVIVIENDA |

## Parsers específicos (`lib/parsers/`)

Tres bancos tienen parser de regex (sin costo de IA):
- `rappicard.ts` — detecta monto `$X.XXX`, comercio, tipo de transacción
- `bancolombia.ts` — detecta monto, tipo (COMPRA/TRANSFERENCIA/INGRESO), comercio
- `nu.ts` — detecta monto, tipo, comercio

`lib/parsers/index.ts` exporta `trySpecificParser(banco, email)` que devuelve `null` si el banco no tiene parser — señal para usar Groq.

**Para agregar un banco nuevo:** crear `lib/parsers/mibanaco.ts` que exporte una función `(email: EmailInput) => ParseResult`, registrarla en `lib/parsers/index.ts`, y agregar el sender en `BANK_SENDERS` / `BANK_SENDER_PATTERNS` en `lib/gmail/client.ts`.

## Extractor IA (`lib/ai/extractor.ts`)

Recibe `{from, subject, date, body, banco}`, manda los primeros 600 chars del body a Groq con `temperature: 0.1`, espera JSON con campos `{fecha, monto, comercio, descripcion, tipo, categoria, ...}`. Si Groq devuelve `{"error": "not_a_transaction"}`, la función retorna `null` y el email se ignora.

El prompt está en español colombiano y tiene reglas explícitas para el formato COP (`$45.000` = 45000).

## Base de datos — puntos clave

- Todos los valores enumerados (`banco`, `tipo`, `categoria`) tienen CHECK constraints en la BD **y** tipos TypeScript en `lib/types.ts`. Si se agrega un valor nuevo hay que actualizar ambos + crear una migración en `supabase/migrations/`.
- `user_tokens` guarda el `gmail_refresh_token` obtenido en el OAuth callback. El `provider_refresh_token` de Supabase solo está disponible justo después del login — se persiste en el callback (`app/api/auth/callback/route.ts`) usando el admin client.
- Todas las tablas tienen RLS habilitado con política `auth.uid() = user_id`.
- `id_auditoria` formato `MMDD-NN` se genera en `generateAuditId()` dentro del sync route contando transacciones del mismo día.

## Auth y tokens Gmail

El login (`app/page.tsx`) solicita scopes: `email profile https://www.googleapis.com/auth/gmail.readonly` con `access_type: offline` y `prompt: consent` para garantizar refresh token.

El callback (`app/api/auth/callback/route.ts`) persiste `session.provider_refresh_token` en `user_tokens`. Durante el sync, el token se refresca con `google.auth.OAuth2` usando `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

El middleware protege `/dashboard/**` y redirige `/` si ya hay sesión.

## Clientes Supabase

- `lib/supabase/client.ts` — browser client (`createBrowserClient`), usado en componentes `'use client'`
- `lib/supabase/server.ts` — server client (`createServerClient` con cookies) + `createAdminClient()` con service role para operaciones que bypasean RLS (sync, callback)

## Dashboard

`app/dashboard/page.tsx` es un Server Component que fetcha transacciones del mes y calcula stats. Pasa todo a `app/dashboard/DashboardClient.tsx` (Client Component) que maneja navegación por mes, logout y refresco post-sync.

Los componentes de UI (`components/dashboard/`) son todos Client Components porque usan estado o Recharts.

`app/demo/page.tsx` es una página pública (sin auth) con 12 transacciones hardcodeadas para mostrar el dashboard sin configuración.

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL          # Supabase Session Pooler: postgresql://postgres.REF:PASS@aws-1-us-east-1.pooler.supabase.com:5432/postgres
GOOGLE_CLIENT_ID      # Google Cloud Console — OAuth 2.0
GOOGLE_CLIENT_SECRET
GROQ_API_KEY          # console.groq.com — gratis, llama-3.3-70b-versatile
NEXT_PUBLIC_APP_URL
```

## Flujo de ramas

```
main               ← siempre deployable
feature/<nombre>   ← una rama por mejora, PR a main
```

**Reglas de git para Claude Code:**
- Nunca hacer commit ni push automáticamente
- Siempre trabajar en ramas `feature/<nombre>`, nunca directo en `main`
- Al terminar un bloque de cambios coherente, avisar: *"Buen momento para commit en `feature/xxx` — ¿lo hacemos?"*
- El merge a `main` y el push los decide el usuario

## Mejoras pendientes (backlog)

- **RappiCard vs RappiPay**: `noreply@rappipay.co` debería mapearse a `RAPPIPAY` (cuenta débito), no `RAPPICARD` (crédito). Requiere migración de BD para agregar el valor al CHECK constraint.
- **Fecha real de transacción**: los parsers usan el header `Date` del email como fallback. Mejorar extracción del timestamp real del body.
- **Transferencias**: mejorar detección en parsers de regex (patrones de Nequi/Daviplata).
- **Nombre real del negocio**: el prompt de Groq debe distinguir el instrumento de pago (RappiCard crédito vs RappiCuenta débito) y extraer el nombre real del establecimiento.
- **Iconos PWA**: faltan `public/icons/icon-192.png` y `public/icons/icon-512.png`.
