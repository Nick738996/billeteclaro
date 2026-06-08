# BilleteClaro — Memoria del Proyecto

## Qué es

**BilleteClaro** — PWA de finanzas personales para Colombia. Lee automáticamente correos de notificación de bancos desde Gmail, extrae cada transacción con parsers específicos + IA como fallback, y presenta un dashboard financiero minimalista. El usuario no hace nada manualmente.

- Dominio objetivo: `billeteclaro.app`
- Mercado: Colombia (MVP)
- Supabase project ref: `txfnesqouciiiklhsjaw` (us-east-1)

---

## Estado de las etapas

- [x] **Etapa 1 — Recolección de datos** ← en curso, casi completa
- [ ] **Etapa 2 — Categorización** (pendiente confirmación)
- [ ] **Etapa 3 — Asesor financiero IA** (pendiente confirmación)

### Criterios Etapa 1 — estado actual

| Criterio | Estado |
|---|---|
| Todos los correos Rappi en Supabase sin duplicados | ✅ dedup por `gmail_message_id UNIQUE` |
| Uber sin doble cobro | ✅ `deduplicateUber()` en sync route |
| Datos persisten al cambiar sesión y mes | ✅ Supabase, no localStorage |
| Cada transacción tiene ID único MMDD-NN | ✅ `generateAuditId()` |
| Nombre del comercio es legible | ✅ `toTitleCase()` en parsers y en UI |
| Ingresos y egresos identificados correctamente | ✅ `isIngreso()`, `isGasto()` excluye `ABONO_DEUDA` |
| Botón sincronizar sin llamadas duplicadas | ⚠️ separado del delete, falta cooldown explícito |
| "Sincronizado hace X minutos" | ❌ pendiente |
| Sync automática si pasaron +15 min | ❌ pendiente |

---

## Comandos

```bash
npm run dev        # servidor local en :3000
npm run build      # build de producción
npm run setup      # aplica schema.sql a Supabase + valida env vars
npx tsc --noEmit   # type check (no hay test runner configurado aún)
```

El setup script (`scripts/setup.mjs`) valida `.env.local`, conecta vía `DATABASE_URL` al Supabase Pooler y ejecuta `supabase/schema.sql`. Requiere todas las variables de `REQUIRED` para continuar; `GOOGLE_CLIENT_ID/SECRET` son opcionales (solo advierten).

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 App Router + Turbopack |
| Base de datos | Supabase (PostgreSQL, us-east-1) |
| Auth | Supabase Auth + Google OAuth |
| Email | Gmail API v1 (`gmail.readonly`) |
| IA / extracción | Gemini API — modelo `gemini-2.0-flash-lite` |
| UI | Tailwind CSS + Recharts (PieChart) |
| PWA | @ducanh2912/next-pwa (deshabilitado en dev) |

---

## Arquitectura del pipeline de sync

El flujo completo vive en `app/api/sync/route.ts` (POST):

```
Gmail OAuth refresh → listBankMessageIds() → filtrar ya procesados
→ por cada email nuevo:
    trySpecificParser(banco, email)  ← rápido, sin costo
    └─ null → extractWithGroq()      ← fallback IA, concurrencia=3
→ deduplicateUber()                  ← descartar pre-autorizaciones
→ upsert en transactions (dedup por gmail_message_id UNIQUE)
→ actualizar sync_log
```

**Deduplicación:** constraint `UNIQUE(user_id, gmail_message_id)` en la BD. El upsert usa `ignoreDuplicates: true`. Re-sincronizar es seguro.

**Límites:** máx 2000 emails por sync, búsqueda desde `2026/05/01` (fecha fija), paginación hasta 2000 mensajes.

**Uber dedup:** si 2 transacciones de Uber en mismo batch con diferencia de tiempo < 2h y montos < 20% de diferencia, se descarta la más temprana (pre-autorización).

---

## Detección de bancos (`lib/gmail/client.ts`)

El banco se detecta por el header `From` del email **antes** de parsear:

| Email sender | Banco |
|---|---|
| `noreply@rappicard.co` | RAPPICARD |
| `noreply@rappipay.co` | RAPPIPAY |
| `noreply@holdingrappipay.co` | RAPPIPAY |

---

## Parsers específicos (`lib/parsers/`)

Dos bancos Rappi tienen parsers de regex (sin costo de IA):

- `rappicard.ts` — dos tipos:
  - `parsePurchase`: extrae `Monto $X`, `Comercio`, fecha ISO. tipo=`COMPRA`
  - `parsePayment`: extrae monto sin $, fecha `DD mmm YYYY HH:MM`. tipo=`ABONO_DEUDA`
- `rappipay.ts` — cinco tipos:
  - `parseTransferenciaRecibida`: `Monto recibido $X` + `tu RappiCuenta`. tipo=`TRANSFERENCIA_RECIBIDA`
  - `parseTransferenciaEnviada`: `Monto transferido $X` + `Llave destino @handle`. tipo=`TRANSFERENCIA_ENVIADA`
  - `parseIngresoBancario`: subject contiene "transferencia bancaria". tipo=`INGRESO`
  - `parsePagoServicio`: `Convenio [name]`, `Pago total $X`. tipo=`PAGO_SERVICIO`
  - `parseRentabilidad`: `Rentabilidad de [Mes] $X`. tipo=`INGRESO`, subcategoria=`rendimiento`

`lib/parsers/index.ts` exporta `trySpecificParser(banco, email)` que devuelve `null` si el banco no tiene parser — señal para usar Groq.

**Para agregar un banco nuevo:** crear `lib/parsers/mibanaco.ts` que exporte una función `(email: EmailInput) => ParseResult`, registrarla en `lib/parsers/index.ts`, y agregar el sender en `BANK_SENDERS` en `lib/gmail/client.ts`.

### Utilidades de parsers (`lib/parsers/utils.ts`)

- `parseCOPAmount(raw)` — maneja `$45.000`, `$45,000`, `400.000,00`
- `parseSpanishDate(dateStr, timeStr?)` — parsea `"02 de mayo de 2026"` + `"03:18 pm"`
- `parseISOLikeDate(s)` — parsea `"2026-06-07 12:25:21"`
- `toTitleCase(str)` — convierte ALL_CAPS → Title Case, respeta mixed-case y @handles

---

## Extractor IA (`lib/ai/extractor.ts`)

Recibe `{from, subject, date, body, banco}`, manda los primeros 600 chars del body a Groq con `temperature: 0.1`, espera JSON con campos `{fecha, monto, comercio, descripcion, tipo, categoria, ...}`. Si Groq devuelve `{"error": "not_a_transaction"}`, la función retorna `null` y el email se ignora.

El prompt está en español colombiano y tiene reglas explícitas para el formato COP (`$45.000` = 45000).

---

## Base de datos — puntos clave

- Todos los valores enumerados (`banco`, `tipo`, `categoria`) tienen CHECK constraints en la BD **y** tipos TypeScript en `lib/types.ts`. Si se agrega un valor nuevo hay que actualizar ambos + crear una migración en `supabase/migrations/`.
- `user_tokens` guarda el `gmail_refresh_token` obtenido en el OAuth callback. El `provider_refresh_token` de Supabase solo está disponible justo después del login — se persiste en el callback (`app/api/auth/callback/route.ts`) usando el admin client.
- Todas las tablas tienen RLS habilitado con política `auth.uid() = user_id`.
- `id_auditoria` formato `MMDD-NN` se genera en `generateAuditId()` dentro del sync route contando transacciones del mismo día.

---

## Auth y tokens Gmail

El login (`app/page.tsx`) solicita scopes: `email profile https://www.googleapis.com/auth/gmail.readonly` con `access_type: offline` y `prompt: consent` para garantizar refresh token.

El callback (`app/api/auth/callback/route.ts`) persiste `session.provider_refresh_token` en `user_tokens`. Durante el sync, el token se refresca con `google.auth.OAuth2` usando `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

El middleware protege `/dashboard/**` y redirige `/` si ya hay sesión.

---

## Clientes Supabase

- `lib/supabase/client.ts` — browser client (`createBrowserClient`), usado en componentes `'use client'`
- `lib/supabase/server.ts` — server client (`createServerClient` con cookies, **async** en Next.js 16) + `createAdminClient()` con service role para operaciones que bypasean RLS (sync, callback)

---

## Dashboard

`app/dashboard/page.tsx` es un Server Component que fetcha transacciones del mes y calcula stats. Pasa todo a `app/dashboard/DashboardClient.tsx` (Client Component) que maneja navegación por mes, logout y refresco post-sync.

Los componentes de UI (`components/dashboard/`) son todos Client Components porque usan estado o Recharts.

`app/demo/page.tsx` es una página pública (sin auth) con 12 transacciones hardcodeadas para mostrar el dashboard sin configuración.

### Lógica de display en TransactionsList

`getDisplayName(t)` genera nombre contextual según `tipo`:
- `TRANSFERENCIA_ENVIADA` → `"Transferencia a @handle"`
- `TRANSFERENCIA_RECIBIDA` → `"Transferencia de Bancolombia"`
- `ABONO_DEUDA` → `"Pago a RappiCard"`
- `PAGO_SERVICIO` → `"Pago Enel"`
- Default → `toTitleCase(comercio)` (corrige ALL_CAPS de datos históricos en DB)

---

## Tipos clave (`lib/types.ts`)

```typescript
type TipoTransaccion = 'COMPRA' | 'TRANSFERENCIA_ENVIADA' | 'TRANSFERENCIA_RECIBIDA'
                     | 'PAGO_SERVICIO' | 'RETIRO' | 'ABONO_DEUDA' | 'INGRESO'

type Categoria = 'HOGAR' | 'TRANSPORTE' | 'SALIDAS' | 'SALUD' | 'SUSCRIPCIONES'
               | 'COMPRAS_ONLINE' | 'INVERSION' | 'DONACIONES' | 'EDUCACION'
               | 'REEMBOLSABLE' | 'TRANSFERENCIA' | 'INGRESO' | 'OTRO'

type Banco = 'RAPPICARD' | 'RAPPIPAY' | 'OTRO'
```

Funciones de formato:
- `formatCOP(amount)` — sin decimales: `$45.000`
- `formatCOPCompact(amount)` — abreviado: `$1.2M`, `$450K`
- `isIngreso(tipo)` — true para INGRESO y TRANSFERENCIA_RECIBIDA
- `isGasto(tipo)` — true para todo excepto ingresos y ABONO_DEUDA

---

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL          # Supabase Session Pooler: postgresql://postgres.REF:PASS@aws-1-us-east-1.pooler.supabase.com:5432/postgres
GOOGLE_CLIENT_ID      # Google Cloud Console — OAuth 2.0
GOOGLE_CLIENT_SECRET
GEMINI_API_KEY        # aistudio.google.com — gratis, gemini-2.0-flash-lite
NEXT_PUBLIC_APP_URL
```

---

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

---

## Decisiones tomadas

| Decisión | Razón |
|---|---|
| Gemini 2.0 Flash Lite para extracción | Misma cuenta Google del OAuth, gratis 1500 req/día, JSON nativo con `responseMimeType` |
| Parsers de regex primero, Groq como fallback | Sin costo para RappiCard/RappiPay que son el 100% del MVP |
| Fecha fija `after:2026/05/01` en Gmail search | Evita sync lenta de 365 días; el usuario solo tiene datos desde mayo |
| `ABONO_DEUDA` excluido de gastos | Pago de tarjeta de crédito no es gasto real; inflaba el balance |
| `toTitleCase` aplicado en parsers Y en UI | Parsers limpian datos nuevos; UI limpia datos históricos en DB |
| Botón de borrar separado del sync | Evitar que delete+sync pasen juntos accidentalmente |
| `cookies()` async en Next.js 15+ | Cambio de API rompía `createClient`; se resolvió con `await` |

---

## Bugs conocidos

- **`scrollbar-hide` no funciona en Safari/Chrome sin el plugin Tailwind**: resuelto con inline `scrollbarWidth: 'none'` + clase CSS en globals.css
- **Uber dedup solo funciona dentro del mismo batch**: si la pre-autorización y el cobro real caen en batches distintos (de 10 emails), no se comparan. Riesgo bajo porque los dos emails llegan con poca diferencia.
- **`id_auditoria` puede tener gaps**: si se borra y re-sincroniza, el contador de `generateAuditId` ve la BD vacía y reinicia desde -01.

---

## Próximos pasos (Etapa 1 — pendientes menores)

1. **"Sincronizado hace X minutos"** — agregar timestamp del último sync en el header del dashboard
2. **Sync automática al abrir app** — solo si `last_sync` tiene más de 15 minutos
3. **Cooldown explícito en sync** — deshabilitar botón 30s después de cada sync

Una vez confirmados: avanzar a **Etapa 2 — Categorización**.

---

## Plan Etapa 2 (cuando se confirme)

Estrategia híbrida sin costo adicional de API:

1. **Nivel 1 — Mapa estático** (`lib/parsers/categories.ts`): Uber→TRANSPORTE, Netflix→SUSCRIPCIONES, etc.
2. **Nivel 2 — Regex** sobre nombre del comercio: `FARM|DROG`→SALUD, `REST|BAR`→SALIDAS, etc.
3. **Nivel 3 — Groq** solo si los dos anteriores fallan; resultado se cachea por comercio.
4. **Edición manual** con opción de aplicar en bulk al mismo comercio.

## Plan Etapa 3 (cuando se confirme)

- Presupuesto mensual por categoría (configurable)
- Alertas: 80%/100% de presupuesto, fragmentación Uber, gastos nocturnos
- IA conversacional con Groq (mismo modelo) — contexto: gastos vs presupuesto por mes
- Tono: directo, colombiano, máximo 3 bullets por respuesta
