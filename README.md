# BilleteClaro

**Tu radar financiero personal para Colombia.**

PWA de finanzas personales que lee automáticamente los correos de notificación de tus bancos desde Gmail, extrae cada transacción con parsers específicos por banco + IA como fallback, y presenta un dashboard financiero con asesor IA conversacional. Sin ingreso manual de datos.

---

## Stack

| Capa                   | Tecnología                                                          |
| ---------------------- | ------------------------------------------------------------------- |
| Framework              | Next.js 16 App Router + Turbopack                                   |
| Base de datos          | Supabase (PostgreSQL, us-east-1)                                    |
| Auth                   | Supabase Auth + Google OAuth                                        |
| Email                  | Gmail API v1 (`gmail.readonly`)                                     |
| IA / extracción emails | Groq API — `llama-3.3-70b-versatile`, `temperature: 0.1`            |
| IA / asesor (insights) | Groq API — `llama-3.3-70b-versatile`, `temperature: 0.1`, JSON mode |
| IA / asesor (chat)     | Groq API — `llama-3.3-70b-versatile`, `temperature: 0.4`            |
| UI                     | Tailwind CSS + CSS variables propias                                |
| Iconos                 | lucide-react                                                        |
| Temas                  | next-themes (`data-theme` attribute, `defaultTheme: "dark"`)        |
| Fuente                 | Inter via `next/font/google`                                        |
| PWA                    | @ducanh2912/next-pwa (deshabilitado en dev)                         |
| Tests                  | Vitest (87 tests)                                                   |

---

## Inicio rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno (ver sección abajo)
cp .env.example .env.local

# 3. Aplicar schema a Supabase
npm run setup

# 4. Iniciar servidor de desarrollo
npm run dev   # → http://localhost:3000
```

---

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                  # Supabase Session Pooler
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GROQ_API_KEY=                  # console.groq.com — gratis, 100k tokens/día
NEXT_PUBLIC_APP_URL=           # http://localhost:3000 en dev
```

---

## Comandos

```bash
npm run dev          # servidor local en :3000
npm run build        # build de producción
npm test             # 87 tests unitarios (Vitest)
npm run test:watch   # modo watch
npx tsc --noEmit     # type check
```

---

## Arquitectura

### Pipeline de sincronización

```
Gmail OAuth refresh
  → listBankMessageIds()  (búsqueda desde 2026/05/01)
  → filtrar ya procesados (transactions + sync_log.skipped_ids)
  → FASE 1: trySpecificParser(banco, email)
           └─ null → extractWithGroq()  (fallback IA, concurrencia=3)
  → FASE 1.5: classifyMerchants()  (Groq solo para categoria='OTRO')
  → FASE 2: deduplicateUber()  (pre-auths → skipped_ids)
  → FASE 3: upsert en transactions  (ignoreDuplicates: true)
  → FASE 4: asignar mes_contable para meses afectados
  → actualizar sync_log
```

### Detección de bancos (`lib/gmail/client.ts`)

| Sender                                                    | Banco       |
| --------------------------------------------------------- | ----------- |
| `noreply@rappicard.co`                                    | RAPPICARD   |
| `noreply@rappipay.co`                                     | RAPPIPAY    |
| `noreply@holdingrappipay.co`                              | RAPPIPAY    |
| `alertasynotificaciones@an.notificacionesbancolombia.com` | BANCOLOMBIA |
| `alertasynotificaciones@notificacionesbancolombia.com`    | BANCOLOMBIA |

**Para agregar un banco:** crear `lib/parsers/<banco>.ts` → registrar en `lib/parsers/index.ts` → agregar sender en `BANK_SENDERS`.

### Mes contable (`lib/utils/mesContable.ts`)

Separa el ciclo económico real (sueldo → próximo sueldo) del mes calendario. Las transacciones posteriores al sueldo van al mes siguiente en el dashboard.

- `FUENTES_SUELDO = ['citibank']` — match parcial en comercio/descripcion
- `UMBRAL_SUELDO = 9_000_000` — monto mínimo para considerar un ingreso como sueldo
- `VENTANA_DIAS = 5` — busca el sueldo en los últimos 5 días del mes
- `FALLBACK_DIAS = 3` — sin sueldo detectado: últimos 3 días → mes siguiente

### Infraestructura de API routes

```typescript
// Patrón estándar para toda route de negocio:
import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'

export const GET = withAuth(async (req, user, supabase) => {
  try {
    return ok(await miServicio(supabase, user.id))
  } catch (e) {
    return err('Mensaje de error')
  }
})
```

La lógica de negocio vive en `lib/services/`, las routes son transporte puro.

---

## Endpoints

| Ruta                                 | Método | Descripción                                         |
| ------------------------------------ | ------ | --------------------------------------------------- |
| `POST /api/sync`                     | POST   | Sincroniza emails nuevos de Gmail                   |
| `GET /api/budgets`                   | GET    | Lee presupuestos del mes (`?mes=yyyy-MM`)            |
| `PUT /api/budgets`                   | PUT    | Guarda en batch. `monto=0` → elimina                |
| `GET /api/ai/insights`               | GET    | Insights del asesor. Cache por `context_hash`       |
| `POST /api/ai/chat`                  | POST   | Chat conversacional con el asesor                   |
| `POST /api/transactions/manual`      | POST   | Crea transacciones manuales                         |
| `PATCH /api/transactions/categorize` | PATCH  | Actualiza categorías en batch                       |
| `DELETE /api/transactions/[id]`      | DELETE | Elimina transacción (Gmail → agrega a skipped_ids)  |
| `POST /api/onboarding/complete`      | POST   | Marca `onboarding_completed = true`                 |

---

## Base de datos

### Tablas

| Tabla           | Propósito                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `transactions`  | Todas las transacciones. UNIQUE `(user_id, gmail_message_id)`. Columnas `mes_contable`, `es_sueldo`    |
| `sync_log`      | Log de cada sync. `skipped_ids text[]` para IDs ignorados (Uber pre-auths, tx eliminadas)              |
| `user_tokens`   | `gmail_refresh_token` por usuario                                                                      |
| `budgets`       | Presupuesto mensual por categoría. UNIQUE `(user_id, mes, categoria)`. `subcategorias jsonb` (UI-only) |
| `ai_insights`   | Cache de insights. UNIQUE `(user_id, mes)`. TTL de 6h por `context_hash`                               |
| `chat_messages` | Historial del chat con el asesor                                                                       |
| `user_settings` | `onboarding_completed boolean DEFAULT false`                                                           |

- RLS habilitado en todas las tablas (`auth.uid() = user_id`)
- `id_auditoria` formato `MMDD-NN` (generado secuencialmente para evitar race conditions)

### Migraciones aplicadas

| Archivo                                | Descripción                                              |
| -------------------------------------- | -------------------------------------------------------- |
| `001_add_rappipay_simplify_bancos.sql` | Soporte RappiPay, simplificación de bancos               |
| `002_budgets.sql`                      | Tabla `budgets`                                          |
| `003_ai_advisor.sql`                   | Tablas `ai_insights` + `chat_messages`                   |
| `004_mes_contable.sql`                 | Columnas `mes_contable text`, `es_sueldo bool`, índice   |
| `005_user_settings.sql`                | Tabla `user_settings` (onboarding)                       |
| ALTER manual                           | `sync_log.skipped_ids text[]`                            |
| ALTER manual                           | Constraints `banco_check` y `categoria_check` actualizados (BANCOLOMBIA, AHORROS, DEUDA) |

---

## Parsers por banco

| Archivo                          | Tipos manejados                                                           |
| -------------------------------- | ------------------------------------------------------------------------- |
| `lib/parsers/rappicard.ts`       | COMPRA, ABONO_DEUDA                                                       |
| `lib/parsers/rappipay.ts`        | TRANSFERENCIA_ENVIADA/RECIBIDA, INGRESO_BANCARIO, PAGO_SERVICIO, INGRESO  |
| `lib/parsers/bancolombia.ts`     | Compra, Transferencia enviada/recibida, Pago QR (formato oraciones)       |
| `lib/parsers/commerceCategories.ts` | `guessCategoria()` — 120+ patrones colombianos (regex, sin costo de API) |

`parseMontoBancolombia()` maneja dos formatos de número:
- `$120,000.00` → coma=miles, punto=decimal
- `$6.790,00` → punto=miles, coma=decimal

---

## IA

### Extractor (`lib/ai/extractor.ts`)

`extractWithGroq()` — fallback para emails sin parser específico. Envía 800 chars del body, retorna `null` si el correo no es transacción o `monto <= 0`.

### Categorizador (`lib/ai/categorizer.ts`)

`classifyMerchants(merchants[])` — clasifica en batch (20 por llamada) los comercios que `guessCategoria()` devuelve como `'OTRO'`. Solo se activa en FASE 1.5 del sync cuando hay comercios sin categorizar.

### Asesor (`lib/services/advisorService.ts`)

- **Insights**: cache por `context_hash` (invalidado cuando cambian datos o avanza el día). TTL 6h.
- **Chat**: incluye últimos 10 mensajes del historial + contexto financiero completo del mes.
- **Rate limit**: si Groq devuelve 429, la API responde 429 con "Límite diario de IA alcanzado".

**Tipos de insight:**

| Tipo        | Color    | Ícono         | Cuándo                                        |
| ----------- | -------- | ------------- | --------------------------------------------- |
| alerta      | rojo     | AlertTriangle | `pct_consumido >= 100%` solamente              |
| consejo     | azul     | Lightbulb     | Acción concreta con número COP hoy             |
| positivo    | verde    | CircleCheck   | Gasto significativamente menor al esperado     |
| proyeccion  | amarillo | TrendingUp    | Proyección al cierre del mes                  |
| observacion | púrpura  | Eye           | Dato relevante sin acción inmediata            |

---

## Dashboard

### Componentes

```
HeaderPill (sticky)
────────────────────────────────
StatsCards          ← balance hero + gastos/ingresos
SpendingChart       ← donut SVG (sin Recharts), top 8 categorías, clickeable
BudgetManager       ← presupuesto mensual, draft+saved pattern
AIAdvisorPanel      ← insights automáticos + chat expandible
── "Transacciones" ──
ManualTransactions  ← panel colapsable para agregar en lote
TransactionsList    ← buscador + chips + bottom sheet + delete por fila
```

### Hooks

| Hook                     | Qué encapsula                                          |
| ------------------------ | ------------------------------------------------------ |
| `useSync`                | Estado del sync (idle/syncing/done/error)              |
| `useMonthNavigation`     | Mes activo, label, isCurrent, prev/next                |
| `useTransactions`        | Fetch de transacciones por mes, SSR-aware              |
| `useTransactionsList`    | Filtrado, delete optimista, batch categorías           |
| `useBudgetManager`       | Fetch presupuestos, draft/saved, normalize, save       |
| `useAdvisor`             | Fetch insights, chat history, refs scroll/focus        |
| `useManualTransactions`  | Draft rows, parseMonto, batch save                     |

`contextVersion` en `DashboardClient` sube con cada evento de datos (sync, add, delete, categoría, presupuesto) e invalida el cache del asesor.

---

## Sistema de diseño

**Reglas fundamentales:** sin `box-shadow`, sin gradientes. Solo bordes `var(--border)`. Glass morphism via `backdropFilter`.

### Tokens CSS (`styles/tokens.css`)

**Superficies:** `--bg` · `--surface` · `--surface-2`

**Colores:** `--green #4ADE80` · `--red #FF6B6B` · `--yellow #FCD34D` · `--blue #60A5FA` · `--purple #A78BFA` (cada uno con variante `*-soft` para badges)

**Radios:**

| Token         | Valor | Uso                              |
| ------------- | ----- | -------------------------------- |
| `--radius-xs` | 4px   | Progress chips, elementos tiny   |
| `--radius-badge` | 6px | Badges inline, inputs, botones pequeños |
| `--radius-pill` | 10px | Inputs redondeados, botón send  |
| `--radius-sm` | 12px  | Botones medianos, InsightCard    |
| `--radius-md` | 18px  | Alertas, cards secundarias       |
| `--radius-lg` | 24px  | Cards principales del dashboard  |
| `--radius-xl` | 32px  | Bottom sheets                    |

### Clases utilitarias (`styles/utilities.css`)

| Clase          | Uso                                                     |
| -------------- | ------------------------------------------------------- |
| `.card`        | Toda card del dashboard (surface + border + blur)       |
| `.input-field` | Todo `<input>`, `<select>`, `<textarea>`                |
| `.skeleton`    | Placeholders de carga                                   |

---

## Routing y onboarding

**Middleware (`middleware.ts`):**
- `/` + no auth → landing
- `/` + auth + no completado → `/onboarding`
- `/` + auth + completado → `/dashboard`
- `/onboarding/**` + completado → `/dashboard`
- `/dashboard/**` + no completado → `/onboarding`
- `/api/**` → siempre pasa

**Flujo onboarding:**
1. `app/onboarding/page.tsx` — bienvenida
2. `app/onboarding/step-2/page.tsx` — sync de emails
3. `app/onboarding/step-3/page.tsx` — presupuesto inicial (4 categorías)

---

## Auth y Gmail

Login solicita `email profile gmail.readonly` con `access_type: offline` y `prompt: consent`.

El `provider_refresh_token` solo está disponible justo después del login → se persiste en el callback usando `createAdminClient()` (service role).

---

## Tipos clave (`lib/types.ts`)

```typescript
type TipoTransaccion =
  'COMPRA' | 'TRANSFERENCIA_ENVIADA' | 'TRANSFERENCIA_RECIBIDA' |
  'PAGO_SERVICIO' | 'RETIRO' | 'ABONO_DEUDA' | 'INGRESO'

type Categoria =
  'HOGAR' | 'TRANSPORTE' | 'SALIDAS' | 'SALUD' | 'SUSCRIPCIONES' |
  'COMPRAS_ONLINE' | 'INVERSION' | 'AHORROS' | 'DEUDA' | 'DONACIONES' |
  'EDUCACION' | 'REEMBOLSABLE' | 'TRANSFERENCIA' | 'INGRESO' | 'OTRO'

type Banco = 'RAPPICARD' | 'RAPPIPAY' | 'BANCOLOMBIA' | 'OTRO'
```

Utilidades: `formatCOP()` · `formatCOPCompact()` · `isIngreso()` · `isGasto()` · `CATEGORIA_LABELS` · `CATEGORIA_COLORS`

---

## Tests

87 tests unitarios con Vitest:

| Suite                                   | Qué cubre                                    |
| --------------------------------------- | -------------------------------------------- |
| `tests/parsers/rappicard.test.ts`       | Parser RappiCard (compras y pagos)           |
| `tests/parsers/rappipay.test.ts`        | Parser RappiPay (todos los tipos)            |
| `tests/parsers/bancolombia.test.ts`     | Parser Bancolombia (4 tipos + monto parsing) |
| `tests/parsers/commerceCategories.test.ts` | `guessCategoria()` con 120+ patrones      |
| `tests/parsers/utils.test.ts`           | `parseCOPAmount`, `parseSpanishDate`, `toTitleCase` |
| `tests/utils/deduplicateUber.test.ts`   | Dedup de pre-auths de Uber                  |
| `tests/utils/mesContable.test.ts`       | `asignarMesContable()` con casos borde      |

---

## Bugs conocidos

- **`id_auditoria` con gaps** — si se borra y re-sincroniza, el contador reinicia desde -01.
- **Uber dedup solo en el mismo sync** — si pre-auth y cobro caen en syncs distintos, no se comparan.
- **Bancolombia emails con imágenes** — algunos correos tienen URLs de imagen antes del texto; si Groq está en rate limit, quedan como omitidos.

---

## Deploy (pendiente)

Orden recomendado:

1. `npm run build` sin errores
2. Crear proyecto en **Vercel**, conectar repo, agregar env vars
3. Comprar `billeteclaro.app` (~$15/año en Namecheap)
4. Conectar dominio a Vercel
5. Agregar en Google OAuth Console:
   - `https://billeteclaro.app/api/auth/callback`
   - `https://billeteclaro.app/api/auth/gmail-callback`
6. Probar sync end-to-end en producción

---

## Flujo de ramas

```
main               ← siempre deployable
feature/<nombre>   ← una por mejora, PR a main
```
