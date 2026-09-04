# BilleteClaro — Memoria del Proyecto

## Qué es

**BilleteClaro** — PWA de finanzas personales para Colombia. El usuario reenvía los correos de notificación de su banco a una dirección única (cero acceso OAuth al correo), la app extrae cada transacción con parsers específicos + IA como fallback, y presenta un dashboard financiero con asesor IA.

- Dominio: `billeteclaro.com` (comprado en Cloudflare)
- Mercado: Colombia (MVP)
- Supabase project ref: `txfnesqouciiiklhsjaw` (us-east-1)

---

## Stack

| Capa                   | Tecnología                                                          |
| ---------------------- | ------------------------------------------------------------------- |
| Framework              | Next.js 16 App Router + Turbopack                                   |
| Base de datos          | Supabase (PostgreSQL, us-east-1)                                    |
| Auth                   | Supabase Auth + Google/Outlook OAuth — solo identidad, nunca lee correo |
| Ingesta de correos     | Reenvío del usuario → Cloudflare Email Routing + Worker (`workers/email-router`) → `/api/ingest/forward` |
| IA / extracción emails | Groq API — `openai/gpt-oss-20b`, `temperature: 0.1`, JSON mode       |
| IA / asesor            | Groq API — `openai/gpt-oss-120b`, JSON mode / `temperature: 0.4`     |
| UI                     | Tailwind CSS + CSS variables propias                                |
| Iconos                 | lucide-react                                                        |
| Temas                  | next-themes (`data-theme` attribute, `defaultTheme: "dark"`)        |
| Fuente                 | Inter via `next/font/google`                                        |
| PWA                    | @ducanh2912/next-pwa (deshabilitado en dev)                         |

**Groq free tier:** 100.000 tokens/día, ~200ms latencia, JSON mode nativo. El cache de insights evita la mayoría de llamadas.

---

## Comandos

```bash
npm run dev        # servidor local en :3000
npm run build      # build de producción
npm test           # 266 tests (Vitest)
npm run test:watch # modo watch
npx tsc --noEmit   # type check
```

---

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL               # Supabase Session Pooler
GROQ_API_KEY               # console.groq.com — gratis, 100k tokens/día
NEXT_PUBLIC_APP_URL
FORWARD_INGEST_SECRET  # secreto compartido entre el Worker de Cloudflare (workers/email-router) y /api/ingest/forward
FORWARD_DOMAIN         # dominio de reenvío mostrado al usuario — billeteclaro.com (Email Routing activo sobre el dominio raíz, no un subdominio)
```

El login con Google/Outlook se configura como provider de OAuth directo en el dashboard de Supabase (Authentication → Providers) — la app no necesita `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`OUTLOOK_CLIENT_ID`/`OUTLOOK_CLIENT_SECRET`/`OUTLOOK_TENANT_ID` ni `TOKEN_ENCRYPTION_KEY` — esas variables eran del modelo OAuth de lectura de correo, eliminado por completo (ver "Bugs conocidos").

---

## Base de datos

| Tabla           | Propósito                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `transactions`  | Todas las transacciones. UNIQUE `(user_id, gmail_message_id)` — para un correo reenviado, `gmail_message_id` es su header `Message-ID` (o un hash del body si no viene). Columnas `mes_contable` y `es_sueldo` |
| `sync_log`      | Resto de la era de sync por OAuth — `deleteTransaction()` todavía inserta un registro `SKIPPED` con el `gmail_message_id` borrado, pero nada lo vuelve a leer hoy (la ingesta por reenvío no consulta `skipped_ids`) |
| `budgets`       | `(user_id, mes, categoria, monto_presupuestado, subcategorias jsonb)`. UNIQUE `(user_id, mes, categoria)` |
| `ai_insights`   | Cache de insights. UNIQUE `(user_id, mes)`. Columnas: `insights jsonb`, `context_hash`, `generated_at`    |
| `chat_messages` | Historial del chat con el asesor. `role CHECK IN ('user','assistant')`                                    |
| `user_settings` | `onboarding_completed boolean DEFAULT false`                                                              |
| `forwarding_addresses` | Dirección única de reenvío por usuario (`token`, `confirmed_at`, `pending_confirm_url`). Reemplaza la ingesta por OAuth — ver `lib/services/forwardingService.ts` |

- RLS habilitado en todas las tablas con `auth.uid() = user_id`
- `id_auditoria` formato `MMDD-NN` — puede tener gaps si se borra y re-sincroniza

---

## Detección de bancos (`lib/email/bankSenders.ts` — `BANK_SENDERS`)

| Sender                                                 | Banco detectado        |
| ------------------------------------------------------ | ---------------------- |
| `noreply@rappicard.co`                                 | RAPPICARD              |
| `noreply@rappipay.co` / `noreply@holdingrappipay.co`  | RAPPIPAY               |
| `alertasynotificaciones@*.notificacionesbancolombia.com` | BANCOLOMBIA          |
| `notificaciones@davivienda.com` / `alertas@...`        | DAVIVIENDA (→ OTRO)    |
| `alertas@bbva.com.co` / `notificaciones@...`           | BBVA (→ OTRO)          |
| `notificaciones@colpatria.com`                         | SCOTIABANK_COLPATRIA (→ OTRO) |
| `alertas@bancodebogota.com.co`                         | BANCO_DE_BOGOTA (→ OTRO) |
| `no-reply@nu.com.co` / `notificaciones@...`            | NU (→ OTRO)            |
| `no-reply@nequi.com.co`                                | NEQUI (→ OTRO)         |
| `notificaciones@lulobank.com`                          | LULO_BANK (→ OTRO)     |
| `alertas@itau.co`                                      | ITAU (→ OTRO)          |
| `notificaciones@falabella.com.co`                      | FALABELLA (→ OTRO)     |

Nota: los bancos marcados **(→ OTRO)** se detectan por el remitente original del correo reenviado (`detectBankFromForwardedBody()` en `lib/email/bankSenders.ts`, busca el email más cercano después de cada línea "De:"/"From:" en los bloques de reenvío citados — tolera reenvíos múltiples y líneas cortadas por el cliente de correo) pero no tienen parser específico — se procesan vía el parser genérico o, si este no logra extraer los datos con certeza, vía el fallback de IA (ver `lib/services/emailPipeline.ts`). El fallback de IA corre incluso para banco `OTRO` (remitente desconocido/extranjero) — a diferencia del viejo modelo por OAuth, un remitente no reconocido ya no es "spam colándose": el usuario mismo curó la fuente al configurar su filtro de reenvío.

**Para agregar un banco nuevo:** crear `lib/parsers/mibanco.ts`, registrar en `lib/parsers/index.ts`, agregar el remitente real observado en `BANK_SENDERS` en `lib/email/bankSenders.ts`.

---

## Parsers específicos (`lib/parsers/`)

- `rappicard.ts` — `parsePurchase` (COMPRA) + `parsePayment` (ABONO_DEUDA)
- `rappipay.ts` — transferencias, ingresos, pagos, rentabilidad
- `bancolombia.ts` — Compra, Transferencia enviada/recibida, Pago QR. Emails en formato de oraciones (no tablas)
- `davibank.ts` — Compra (Davivienda)
- `generic.ts` — `tryGenericParser(email, banco)`: capa intermedia por patrones comunes (verbos en español: "compraste", "transferiste", "recibiste una transferencia", "retiro en cajero", etc.) para bancos sin parser dedicado (BBVA, Nequi, Nu, Scotiabank Colpatria, Banco de Bogotá, Lulo Bank, Itaú, Falabella). Solo devuelve resultado si encuentra `tipo` Y `monto` con certeza; si no, `null`. Marca `flags: ['parser_generico']` para diferenciarlo de un parser dedicado.
- `commerceCategories.ts` — `guessCategoria(comercio)`: 120+ patrones colombianos

`lib/services/emailPipeline.ts::extractTransaction(email, banco)` es el punto de entrada del pipeline de extracción: parser específico (`trySpecificParser`) → parser genérico (`tryGenericParser`) → fallback IA (`lib/ai/extractor.ts::extractWithGroq`, solo si el banco fue identificado por remitente — nunca para `banco === 'OTRO'`).

---

## Pipeline de ingesta por reenvío (`app/api/ingest/forward/route.ts` → `lib/services/forwardingService.ts`)

```
Worker de Cloudflare (workers/email-router) recibe el correo reenviado
→ parsea el MIME crudo con postal-mime, extrae token (local-part de la
  dirección de reenvío), from, subject, date, body, Message-ID
→ POST a /api/ingest/forward con X-Forward-Secret (auth servidor-a-servidor,
  no hay sesión de usuario — quien llama es el Worker)
→ processForwardedEmail():
  1. Resolver user_id por token (forwarding_addresses) — token desconocido → descartar
  2. Si es el correo de confirmación de Gmail/Outlook → auto-confirmar, salir
  3. Si la dirección aún no está confirmada (confirmed_at IS NULL) → descartar
  4. detectBankFromForwardedBody() sobre el body crudo (antes de limpiar)
  5. cleanForwardedBody() — quita encabezados de reenvío Gmail/Outlook y
     firmas-imagen antes de pasarle el correo a cualquier parser
  6. extractTransaction() — parser específico → parser genérico → Groq
     (ver lib/services/emailPipeline.ts) → null → omitido
  7. Dedup de Uber contra lo ya persistido (matchUberAgainstPersisted)
  8. Dedup por contenido (mismo banco/tipo/monto/fecha exacta) — cubre
     reenviar el mismo correo original dos veces con Message-ID distinto
  9. upsert en transactions (onConflict user_id+gmail_message_id,
     ignoreDuplicates) → reassignCalendarMonths() para el mes afectado
```

No existe un "sync" periódico ni un botón de sincronizar — toda transacción llega por push apenas el correo se reenvía. El backfill de correos viejos lo hace el propio cliente de correo del usuario (checkbox "aplicar también a conversaciones existentes" en Gmail al crear el filtro, "Ejecutar regla ahora" en Outlook) — cero OAuth de por medio.

**Mes contable:** `FUENTES_SUELDO = ['citibank']`, `UMBRAL_SUELDO = 9_000_000`, `VENTANA_DIAS = 5`, `FALLBACK_DIAS = 3`

---

## API Routes — patrón

```typescript
import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'

export const GET = withAuth(async (req, user, supabase) => {
  try {
    return ok(await miFuncion(supabase, user.id))
  } catch (e) {
    return err('Mensaje de error')
  }
})
```

Lógica de negocio en `lib/services/`, nunca en route handlers.

---

## Sistema de diseño

**Reglas:** sin `box-shadow`, sin gradientes. Solo bordes `var(--border)`. Glass morphism via `backdropFilter`.

**Clases clave:** `.card`, `.input-field`, `.skeleton` en `styles/utilities.css`

**Tokens de radio:** `--radius-xs/badge/pill/sm/md/lg/xl`

**Colores principales:** `--green #4ADE80` · `--red #FF6B6B` · `--yellow #FCD34D` · `--blue #60A5FA` · `--purple #A78BFA`

> `CategoriesCard` (fusión de SpendingChart + BudgetOverview) usa colores hex vía `getCategoryColor()` porque SVG `fill` no acepta `var()`.

---

## Tipos clave (`lib/types.ts`)

```typescript
type Categoria = 'HOGAR' | 'TRANSPORTE' | 'SALIDAS' | 'SALUD' | 'SUSCRIPCIONES'
  | 'COMPRAS_ONLINE' | 'INVERSION' | 'AHORROS' | 'PRESTAMO' | 'DEUDA' | 'DONACIONES'
  | 'EDUCACION' | 'REEMBOLSABLE' | 'TRANSFERENCIA' | 'INGRESO' | 'OTRO'

type Banco = 'RAPPICARD' | 'RAPPIPAY' | 'BANCOLOMBIA' | 'DAVIVIENDA' | 'BBVA'
  | 'SCOTIABANK_COLPATRIA' | 'BANCO_DE_BOGOTA' | 'NU' | 'NEQUI' | 'LULO_BANK'
  | 'ITAU' | 'FALABELLA' | 'OTRO'

type InsightTipo = 'alerta' | 'consejo' | 'positivo' | 'proyeccion' | 'observacion'
```

---

## Flujo de ramas

```
main               ← siempre deployable
feature/<nombre>   ← una por mejora, PR a main
```

**Reglas de git:** Nunca commit ni push automático. Avisar cuando sea buen momento.

---

## Bugs conocidos

- **`id_auditoria` con gaps** — si se borra una transacción y el correo original se reenvía de nuevo, el contador reinicia desde -01.
- **Bancolombia emails con imágenes** — algunos emails de Bancolombia tienen URLs de imagen antes del texto de transacción; los parsers deberían manejarlos pero si Groq está en rate limit quedan como omitidos.
- **`sync_log` es un resto sin lector** — `deleteTransaction()` (`lib/services/transactionService.ts`) todavía inserta un registro `SKIPPED` ahí al borrar una transacción de Gmail/reenvío, pensado para que el próximo sync la ignorara. La ingesta por reenvío nunca consulta esa tabla, así que ese insert hoy no tiene efecto — no es dañino, pero es candidato a limpieza.

**✅ Resuelto — Uber dedup solo dentro del mismo batch.** `deduplicateUber()` (`lib/utils/deduplicateUber.ts`) solo comparaba transacciones dentro del mismo lote recibido en una sola llamada. Si la pre-auth y el cobro final llegaban en correos reenviados por separado, nunca se veían juntas → el cobro final se insertaba como gasto duplicado. Se agregó `matchUberAgainstPersisted()`, que compara la transacción de Uber nueva contra las ya persistidas (`transactions` filtrado por `comercio ilike '%uber%'`, consultado en `forwardingService.ts::processForwardedEmail`). Si hay match dentro de la misma ventana de 15 min:
  - el cobro final llega después → se hace `UPDATE` de la fila ya persistida (monto/fecha/descripcion reales) y no se inserta fila nueva.
  - la pre-auth llega tarde/desordenada → se descarta sin tocar la fila (el cobro final ya persistido queda intacto).
  Tests en `tests/utils/deduplicateUber.test.ts`.

**✅ Resuelto — Se eliminó por completo la lectura de correo vía OAuth (2026-09-04).** La app leía Gmail/Outlook directamente (`gmail.readonly`/`Mail.Read`) vía un botón de "Conectar correo" separado del login. Generaba desconfianza real en usuarios de prueba (la pantalla de consentimiento de Google no tiene un scope más angosto que "todo tu correo"). Se reemplazó enteramente por el modelo de reenvío descrito arriba — el login ahora es 100% identidad, la app nunca pide ni usa acceso al correo. Se borraron `app/api/auth/{gmail,outlook}-{connect,callback}`, `app/api/auth/disconnect`, `app/api/sync`, `lib/services/syncService.ts`, `lib/email/{gmail,outlook,index,authResults}.ts`, `lib/gmail/client.ts`, `lib/utils/tokenCrypto.ts`, y la dependencia `googleapis`.

---

## Lo que falta antes de lanzar

### ⬜ Etapa 2 — Categorización inteligente (parcial)

- [x] `guessCategoria()` con 120+ patrones — `lib/parsers/commerceCategories.ts`
- [ ] **Caché por comercio** — nueva tabla `commerce_rules`. Si el usuario cambia "Uber" a TRANSPORTE una vez, se aplica siempre en futuros syncs.

### ⬜ Accesibilidad (a11y) — WCAG 2.1 AA

| Área                                    | Estado |
| --------------------------------------- | ------ |
| `role`/`aria-expanded` en colapsables   | ✅ Resuelto — `BudgetManager.tsx` y `AIAdvisorPanel.tsx` (chat) ya lo tenían; el gap real era el botón "+" de `TransactionsList.tsx` (no recibía el estado abierto/cerrado de `ManualTransactions`) — corregido pasando `addOpen` como prop desde `DashboardClient.tsx` |
| Contraste modo claro                    | ✅ Resuelto — `--text-muted`/`--text-subtle` en `tokens.css` oscurecidos y verificados con luminancia relativa WCAG (≥4.5:1 contra `--surface-2`, el fondo más restrictivo real) |
| Semántica de headings (h1→h2→h3)        | Pendiente — Dashboard, verificar jerarquía                       |
| Touch targets 44px                      | ✅ Resuelto — `HeaderPill`, filas de leyenda de `CategoriesCard`, chips de filtro y botones chicos de `BudgetManager` ya en 44px (objetivo táctil real, visual sin cambios en los casos inline vía `::after` expandido) |
| `prefers-reduced-motion`                | Pendiente — Animaciones CSS (`animate-spin`, transiciones)       |

**Herramientas:** `axe-core` browser extension · Lighthouse accessibility audit

### ⬜ E2E con Maestro

Flujos a cubrir (en orden de prioridad):
1. Login con Google → llega al dashboard — `maestro/flows/login.yaml`
2. Sync de emails → aparecen transacciones — `maestro/flows/sync.yaml`
3. Agregar transacción manual — `maestro/flows/add_manual.yaml`
4. Editar categoría — `maestro/flows/edit_category.yaml`
5. Eliminar transacción — `maestro/flows/delete_tx.yaml`
6. Guardar presupuesto — `maestro/flows/save_budget.yaml`
7. Ver insights del asesor IA — `maestro/flows/ai_insights.yaml`

**Setup:** `brew install maestro` · `maestro test maestro/flows/login.yaml` · Requiere app en `:3000`

### ✅ Deploy — COMPLETADO (2026-06-12)

**Dominio:** `billeteclaro.com` — comprado en Cloudflare ($10.44/yr). DNS gestionado desde Cloudflare (CDN + SSL + DDoS gratis).

| Paso | Estado | Descripción |
| ---- | ------ | ----------- |
| 1 | ✅ | `npm run build` sin errores |
| 2 | ✅ | Proyecto en Vercel conectado a `github.com/Nick738996/billeteclaro` |
| 3 | ✅ | Variables de entorno configuradas en Vercel |
| 4 | ✅ | Dominios `billeteclaro.com` y `www.billeteclaro.com` agregados en Vercel |
| 5 | ✅ | CNAME en Cloudflare apuntando a `d9491c5a8e86fc88.vercel-dns-017.com` (proxy desactivado) |
| 6 | ✅ | DNS propagado — ambos dominios con "Valid Configuration" en Vercel |
| 7 | ✅ | Google OAuth: URIs autorizados para `billeteclaro.com` y `www.billeteclaro.com` |
| 8 | ✅ | Supabase: Site URL `https://billeteclaro.com`, Redirect URLs para ambos dominios |
| 9 | ✅ | Test users: `raul7389@gmail.com`, `caterine7226@gmail.com`, `isabellaaprada@gmail.com` |
| 10 | ✅ | Login con Google funcionando en prod |
| 11 | ✅ | Sync de emails funcionando en prod |

**Notas del deploy:**
- `www.billeteclaro.com` y `billeteclaro.com` son ambos Production en Vercel (sin redirect entre ellos)
- Supabase Redirect URLs incluye `https://billeteclaro.com/**` y `https://www.billeteclaro.com/**`
- Google OAuth tiene URIs para ambos dominios (con y sin www)
- Se corrigió instanciación de Groq a nivel de módulo en `advisorService.ts`, `extractor.ts` y `categorizer.ts` — movida a getter lazy para que el build funcione sin `GROQ_API_KEY`
- `lucide-react` faltaba en `package.json` — agregado

**Variables de entorno en Vercel (paso 3):**

| Variable | Valor en producción |
| -------- | ------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | igual que en `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | igual que en `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | igual que en `.env.local` |
| `DATABASE_URL` | igual que en `.env.local` (Session Pooler de Supabase) |
| `GOOGLE_CLIENT_ID` | igual que en `.env.local` |
| `GOOGLE_CLIENT_SECRET` | igual que en `.env.local` |
| `GROQ_API_KEY` | igual que en `.env.local` |
| `NEXT_PUBLIC_APP_URL` | `https://billeteclaro.com` ← cambiar esto en prod |

**Notas:**
- Vercel plan Hobby es gratis e incluye dominio custom y SSL automático
- El SSL de Cloudflare no se necesita activar — Vercel lo gestiona. Cloudflare actúa solo como DNS
- Si en algún paso Vercel da error de SSL, verificar que el proxy de Cloudflare (nube naranja) esté desactivado en el registro DNS
- Groq free tier: 100k tokens/día compartidos entre todos los usuarios. Con 5-10 personas no hay problema; si crece, activar plan de pago en console.groq.com (~$0.06/millón tokens)
- Mientras la app esté en modo "Testing" de Google, solo los emails agregados en el paso 9 pueden hacer login. Para abrir a cualquiera se necesita verificación de Google (proceso largo).

---

### CI/CD

**Vercel lo hace automático** una vez conectado el repo en el paso 2:

| Evento | Resultado |
| ------ | --------- |
| Push a `main` | Deploy a producción en `billeteclaro.com` |
| Push a `feature/*` o PR | Preview deployment con URL única (ej. `billeteclaro-git-feature-x.vercel.app`) |

No se necesita configurar nada extra — Vercel detecta Next.js y corre `npm run build` en cada push.

**GitHub Actions CI — ACTIVO** (`.github/workflows/ci.yml` ya creado):

Cada PR y push a `main` corre automáticamente `npm test` y `npx tsc --noEmit`.

**Ejemplo del workflow:**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npx tsc --noEmit
```

Con esto, cada PR corre la suite completa de tests y el type check antes de mergear. Vercel deployea igualmente en paralelo pero el PR queda bloqueado si los tests fallan.

**Flujo de trabajo normal:**
```
feature/xxx → PR → CI corre tests → merge a main → Vercel deploya a prod automáticamente
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
