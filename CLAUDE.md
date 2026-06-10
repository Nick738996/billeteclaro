# BilleteClaro — Memoria del Proyecto

## Qué es

**BilleteClaro** — PWA de finanzas personales para Colombia. Lee automáticamente correos de notificación de bancos desde Gmail, extrae cada transacción con parsers específicos + IA como fallback, y presenta un dashboard financiero con asesor IA. El usuario no ingresa datos manualmente (a menos que quiera).

- Dominio objetivo: `billeteclaro.app`
- Mercado: Colombia (MVP)
- Supabase project ref: `txfnesqouciiiklhsjaw` (us-east-1)

---

## Mapa de etapas

```
[✅ Etapa 1]  Recolección de datos (Gmail → Supabase)
[✅ UI/UX]    Sistema de diseño, dark/light mode, glass morphism
[✅ Etapa 3]  Asesor financiero IA
[✅ Refactor] Auditoría, limpieza de código y capa API
[✅ Feature]  Mes contable — ciclo sueldo vs. mes calendario
[⬜ Etapa 2]  Categorización inteligente  ← pendiente
[⬜ QA]       Testing unitario (Vitest), E2E (Maestro), accesibilidad  ← pendiente
[⬜ Deploy]   Dominio, hosting, PWA mobile  ← pendiente
```

---

## Estado detallado por etapa

### ✅ Etapa 1 — Recolección de datos

| Criterio                                     | Estado                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| Correos Rappi en Supabase sin duplicados     | ✅ dedup por `gmail_message_id UNIQUE`                       |
| Uber sin doble cobro                         | ✅ `deduplicateUber()` — pre-auths en `sync_log.skipped_ids` |
| Datos persisten al cambiar sesión y mes      | ✅ Supabase, no localStorage                                 |
| ID único por transacción                     | ✅ `generateAuditId()` — formato `MMDD-NN`                   |
| Nombre del comercio legible                  | ✅ `toTitleCase()` en parsers y en UI                        |
| Ingresos/egresos identificados correctamente | ✅ `isIngreso()`, `isGasto()` excluye `ABONO_DEUDA`          |
| Botón sync separado del delete               | ✅ `HeaderPill` — sync + reset con confirmación 4s           |

### ✅ UI/UX base

Glass morphism, dark/light mode, sistema de diseño con CSS variables, sin sombras ni gradientes. Ver sección "Sistema de diseño" más abajo.

### ✅ Etapa 3 — Asesor financiero IA

| Feature                                              | Componente / Ruta                                           |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Presupuesto mensual por categoría + subcategorías    | `BudgetManager` + `GET/PUT /api/budgets`                    |
| Asesor IA: insights automáticos al cargar            | `AIAdvisorPanel` + `GET /api/ai/insights`                   |
| Chat conversacional con el asesor                    | `AIAdvisorPanel` (sección expandible) + `POST /api/ai/chat` |
| Cache de insights por `context_hash` (6h TTL)        | tabla `ai_insights` en Supabase                             |
| `contextVersion` — invalidación de cache por eventos | `DashboardClient` → `bumpContext()`                         |
| Agregar transacciones manuales en lote               | `ManualTransactions` + `POST /api/transactions/manual`      |
| Edición de categoría por transacción (batch)         | `TransactionsList` + `PATCH /api/transactions/categorize`   |
| Eliminar transacción individual                      | `TransactionsList` + `DELETE /api/transactions/[id]`        |
| Skeleton loader del asesor (imita InsightCard)       | `SkeletonInsights` en `AIAdvisorPanel`                      |

**Cuándo se llama a Groq para insights:**

- Al cargar el dashboard (si hash cambió o no hay cache)
- Al pulsar "Actualizar" (`?force=true`)
- Cuando `contextVersion` sube: sync, add manual, delete, categoría editada, presupuesto guardado
- NO se llama si el hash del contexto es idéntico al cacheado (mismo día, mismos datos)

**InsightCard — tipos y colores:**

```
alerta      → rojo    (AlertTriangle)  — solo pct_consumido >= 100%
consejo     → azul    (Lightbulb)      — acción concreta con número HOY
positivo    → verde   (CircleCheck)    — gasto significativamente menor al esperado
proyeccion  → amarillo (TrendingUp)    — proyección al cierre del mes
observacion → púrpura (Eye)           — dato relevante sin acción inmediata obvia
```

### ⬜ Etapa 2 — Categorización inteligente (pendiente)

`guessCategoria()` en `lib/parsers/commerceCategories.ts` ya cubre 120+ patrones. Lo que falta:

1. **Caché por comercio** (`commerce_rules` o similar) — si el usuario cambia "Uber" a TRANSPORTE una vez, se aplica siempre
2. **Groq como último recurso** — para comercios no reconocidos por los patrones

> La edición manual ya existe en Etapa 3. Etapa 2 agrega memoria y automatización.

### ⬜ Pendientes menores (Etapa 3 casi completa)

1. **Copiar presupuesto del mes anterior** — botón en `BudgetManager` que precarga el mes previo
2. **recharts** — está en `package.json` pero el donut es SVG propio. Eliminar la dependencia.

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

**Groq free tier:** 14.400 req/día, ~200ms latencia, JSON mode nativo. El cache de insights evita la mayoría de llamadas.

---

## Comandos

```bash
npm run dev        # servidor local en :3000
npm run build      # build de producción
npm run setup      # aplica schema.sql a Supabase + valida env vars
npx tsc --noEmit   # type check (no hay test runner configurado aún)
```

---

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL               # Supabase Session Pooler
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GROQ_API_KEY               # console.groq.com — gratis, 14.400 req/día
NEXT_PUBLIC_APP_URL
```

---

## Base de datos

### Tablas

| Tabla           | Propósito                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `transactions`  | Todas las transacciones. UNIQUE `(user_id, gmail_message_id)`. Columnas `mes_contable` y `es_sueldo`      |
| `sync_log`      | Log de cada sync. `skipped_ids text[]` guarda IDs ignorados (Uber pre-auths, transacciones eliminadas)    |
| `user_tokens`   | `gmail_refresh_token` por usuario                                                                         |
| `budgets`       | `(user_id, mes, categoria, monto_presupuestado, subcategorias jsonb)`. UNIQUE `(user_id, mes, categoria)` |
| `ai_insights`   | Cache de insights. UNIQUE `(user_id, mes)`. Columnas: `insights jsonb`, `context_hash`, `generated_at`    |
| `chat_messages` | Historial del chat con el asesor. `role CHECK IN ('user','assistant')`                                    |

### Migraciones aplicadas

| Archivo                                | Estado                                               |
| -------------------------------------- | ---------------------------------------------------- |
| `001_add_rappipay_simplify_bancos.sql` | ✅ aplicada                                          |
| `002_budgets.sql`                      | ✅ aplicada                                          |
| `003_ai_advisor.sql`                   | ✅ aplicada (tablas `ai_insights` + `chat_messages`) |
| `sync_log.skipped_ids` (ALTER manual)  | ✅ aplicada                                          |
| `004_mes_contable.sql`                 | ✅ aplicada (`mes_contable text`, `es_sueldo bool`, índice) |

### Puntos clave

- RLS habilitado en todas las tablas con `auth.uid() = user_id`
- `subcategorias` en `budgets` es `jsonb` — UI-only, no se refleja en `transactions`
- `id_auditoria` formato `MMDD-NN` — puede tener gaps si se borra y re-sincroniza
- `user_tokens.gmail_refresh_token` — se persiste en el callback de OAuth usando `createAdminClient()` (el `provider_refresh_token` de Supabase solo está disponible justo después del login)
- `mes_contable` — asignado en FASE 4 del sync para todas las transacciones de los meses afectados. El dashboard filtra por esta columna, no por rango de `fecha`.

---

## Arquitectura del pipeline de sync (`app/api/sync/route.ts`)

```
Gmail OAuth refresh → listBankMessageIds() → filtrar ya procesados
  (processedIds = gmail_message_ids de transactions + todos los skipped_ids de sync_log)
→ FASE 1: por cada email nuevo:
    trySpecificParser(banco, email)   ← rápido, sin costo de API
    └─ null → extractWithGroq()       ← fallback IA, concurrencia=3
→ FASE 2: deduplicateUber() sobre TODAS las transacciones del sync
    → pre-auths de Uber → guardados en sync_log.skipped_ids
→ FASE 3: upsert en transactions (ignoreDuplicates: true)
→ FASE 4: asignar mes_contable
    → detectar meses calendario afectados por las nuevas transacciones
    → por cada mes: fetch ALL transactions del mes (existentes + nuevas)
    → asignarMesContable() → update mes_contable + es_sueldo en cada fila
→ log: "[sync] N emails — X parser | Y Groq | Z omitidos | W Uber preauth | E errores"
→ actualizar sync_log (finished_at, skipped_ids, status)
```

**Límites:** máx 2000 emails por sync, búsqueda desde `after:2026/05/01` (fecha fija).

### Mes contable (`lib/utils/mesContable.ts`)

El mes contable separa el ciclo económico real (sueldo → próximo sueldo) del mes calendario. Las transacciones posteriores al sueldo van al mes siguiente en el dashboard.

**Configuración:**
- `FUENTES_SUELDO = ['citibank']` — match parcial en `comercio ?? '' + descripcion ?? ''` (toLowerCase)
- `UMBRAL_SUELDO = 9_000_000` — monto mínimo para considerar un ingreso como sueldo
- `VENTANA_DIAS = 5` — buscar el sueldo en los últimos 5 días del mes (ej. mayo 31 días → desde día 27)
- `FALLBACK_DIAS = 3` — si no hay sueldo detectado, los últimos 3 días → mes siguiente

**Lógica de `asignarMesContable(transacciones)`:**
1. Agrupa por mes calendario (`fecha.slice(0,7)`)
2. Por cada mes: busca sueldo en `dia >= inicioVentana` — primero por `FUENTES_SUELDO`, luego por monto solo
3. Si sueldo encontrado: transacciones con `timestamp >= sueldo.timestamp` → `mes_contable = mes+1`
4. Sin sueldo: transacciones en últimos `FALLBACK_DIAS` días → `mes_contable = mes+1`
5. Marca `es_sueldo: true` en la transacción detectada (referencia exacta, no por valor)

**Ejemplo verificado (mayo 2026):**
- 27/mayo → `mes_contable: 2026-05` ✓
- 28/mayo 09:40 Citibank +$10.254.616 → `mes_contable: 2026-06`, `es_sueldo: true` ✓
- 28/mayo 11:45 Rappi → `mes_contable: 2026-06` ✓
- 29–31/mayo → `mes_contable: 2026-06` ✓

**Para agregar una fuente de sueldo nueva:** añadir el string a `FUENTES_SUELDO` en `mesContable.ts`.

### Eliminación de transacción individual (`DELETE /api/transactions/[id]`)

- Verifica ownership (`user_id`) antes de borrar
- Si es transacción de Gmail: inserta fila en `sync_log` con `skipped_ids = [gmail_message_id]` para que el próximo sync la ignore
- Si es transacción manual (`gmail_message_id` starts with `'manual_'`): solo borra de DB

---

## Detección de bancos (`lib/gmail/client.ts`)

| Sender                       | Banco     |
| ---------------------------- | --------- |
| `noreply@rappicard.co`       | RAPPICARD |
| `noreply@rappipay.co`        | RAPPIPAY  |
| `noreply@holdingrappipay.co` | RAPPIPAY  |

**Para agregar un banco nuevo:** crear `lib/parsers/mibanaco.ts`, registrar en `lib/parsers/index.ts`, agregar sender en `BANK_SENDERS` en `lib/gmail/client.ts`.

---

## Parsers específicos (`lib/parsers/`)

- `rappicard.ts` — `parsePurchase` (tipo=`COMPRA`) + `parsePayment` (tipo=`ABONO_DEUDA`)
- `rappipay.ts` — `parseTransferenciaRecibida`, `parseTransferenciaEnviada`, `parseIngresoBancario`, `parsePagoServicio`, `parseRentabilidad`
- `commerceCategories.ts` — `guessCategoria(comercio)`: 120+ patrones colombianos. SALIDAS antes de TRANSPORTE para que "rappi" no matchee TRANSPORTE.

`trySpecificParser(banco, email)` devuelve `null` si no hay parser → señal para Groq.

---

## Extractor IA (`lib/ai/extractor.ts`)

`extractWithGroq()` — recibe `{from, subject, date, body, banco}`, envía 800 chars del body a Groq con `response_format: json_object` y `temperature: 0.1`. Retorna `null` si responde `{"error": "not_a_transaction"}` o si `monto <= 0`.

---

## Asesor IA (`app/api/ai/insights/route.ts`)

### `buildAdvisorContext()` (`lib/ai/buildAdvisorContext.ts`)

Deriva del mes + transacciones + presupuestos:

- `dias_transcurridos` — día actual si es mes corriente, else totalDías
- `dias_restantes` / `dias_restantes_semana`
- `gastos_por_categoria` — filtra con `isGasto()`
- `presupuesto_por_categoria`
- `total_gastado` / `total_presupuestado` / `ingreso_estimado`

### `hashContext()` — char-code sum del contexto serializado. Cambia cuando cambian datos o avanza el día (por `dias_transcurridos`).

### Cache (`ai_insights` tabla)

- Hit: hash coincide + `generated_at > now() - 6h` → devuelve sin llamar Groq
- Miss: llama Groq, guarda en cache, devuelve
- `?force=true`: salta el cache siempre (botón "Actualizar")

### System prompt — reglas críticas

- `alerta`: solo cuando `pct_consumido >= 100%`
- `consejo`: acción ejecutable HOY con número exacto (vs. `observacion`)
- `observacion`: dato relevante sin acción inmediata (púrpura, ícono Eye)
- `positivo`: gasto significativamente menor al esperado — formato con Z = (limite - gastado) / dias_restantes \* 7
- Si presupuesto excedido: nunca "máximo $0 más" — mostrar exceso + consecuencia + comercio top
- Sin frases: "Considera reducir", "Podrías intentar", "Sería recomendable"
- REGLA ANTI-DUPLICADOS: un solo insight por categoría (fusionar alerta + consejo)

---

## Dashboard (`app/dashboard/`)

### `DashboardClient.tsx` — estado global

```
txs            — transacciones del mes (recargadas por refetch de useTransactions)
budgets        — Record<string,number> compartido con AIAdvisorPanel
activeFilter   — string compartido entre SpendingChart y TransactionsList
contextVersion — número que sube en cada evento de datos → dispara re-fetch del asesor
```

**Eventos que llaman `bumpContext()`:**
sync completo · add manual · delete transacción · categoría editada · presupuesto guardado

### Layout de componentes

```
HeaderPill (sticky)
────────────────────────────────
StatsCards          ← balance hero + gastos/ingresos
SpendingChart       ← donut SVG propio, top 8 categorías, clickeable
BudgetManager       ← presupuesto mensual, draft+saved pattern
AIAdvisorPanel      ← insights automáticos + chat expandible
── "Transacciones" ──
ManualTransactions  ← panel colapsable para agregar en lote
TransactionsList    ← buscador + chips + bottom sheet + delete por fila
```

### Hooks (`hooks/`)

Lógica extraída de los componentes. Los componentes solo renderizan — la lógica vive en los hooks.

| Hook | Qué encapsula |
|---|---|
| `useSync` | Estado del sync (idle/syncing/done/error), fetch a `/api/sync`, callback `onComplete` |
| `useMonthNavigation` | Mes activo, label, isCurrent, prev/next, `goTo()` que actualiza URL |
| `useTransactions` | Fetch de transacciones por mes, `useRef(isFirstRender)` para no re-fetch en mount (SSR data) |
| `useTransactionsList` | Filtrado, delete optimista, batch categorías |
| `useBudgetManager` | Fetch presupuestos, patrón draft/saved, `normalize()`, `isDirty`, save |
| `useAdvisor` | Fetch insights, chat history, envío de mensajes, refs de scroll/focus |
| `useManualTransactions` | Draft rows, `parseMonto`, batch save |

**Patrón SSR + client fetch:** `useTransactions` usa `useRef(isFirstRender)` para saltar el primer `useEffect` — los datos SSR de `initialTxs` se usan en mount sin llamada extra a la DB.

**Props drilling:** `activeFilter` pasa directo de `DashboardClient` a `SpendingChart` y `TransactionsList` (1 nivel) — no se necesita Context.

### Componentes (`components/dashboard/`)

**`HeaderPill`** — usa `useSync`. Sync | reset (confirmación 4s) | theme toggle | logout. Cápsula translúcida 36px.

**`StatsCards`** — Balance hero full-width + Gastos/Ingresos en fila de 2. Sin lógica propia.

**`SpendingChart`** — donut SVG propio (sin Recharts). Slices y leyenda clickeables → filtra `TransactionsList` via `activeFilter`.

**`BudgetManager`** — usa `useBudgetManager`. Estado `expanded` queda local (solo UI). Llama `onSaved()` → `bumpContext()` en DashboardClient.

**`AIAdvisorPanel`** — usa `useAdvisor`. Auto-fetch si `budgetCount >= 1 && txCount >= 5`. InsightCard: superficie neutra + borde izquierdo de color + badge de tipo + badge de categoría. Skeleton imita InsightCard. Chat expandible con `ThinkingDots`.

**`ManualTransactions`** — usa `useManualTransactions`. Estado `open` queda local. Batch POST.

**`TransactionsList`** — usa `useTransactionsList`. Estado `pickerTxId` queda local. `CategoryPicker` renderizado fuera del contenedor `backdropFilter` (fix WebKit `position:fixed`). Delete con confirmación 2s inline, `deletedIds: Set<string>` para remoción optimista.

### UI (`components/ui/`)

**`Skeleton`** — `<Skeleton width height radius>` + `<SkeletonCard>`. Usa tokens `var(--surface-2)`, `var(--surface)`, `var(--border)`, `var(--glass-blur)`. Los componentes pueden usar la clase `.skeleton` directamente para casos simples.

---

## API Routes

### Infraestructura (`lib/api/`)

- **`lib/api/response.ts`** — `ok(data, status?)` / `err(message, status?)`. Toda route debe usar estos helpers; nunca `NextResponse.json()` directo.
- **`lib/api/withAuth.ts`** — `withAuth(handler)`: resuelve `getAuthUser()`, devuelve 401 si no hay sesión, inyecta `(req, user, supabase, ctx)` al handler. Usar en **todas** las routes de negocio.

**Patrón para una route nueva:**
```typescript
import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { miFuncion } from '@/lib/services/miService'

export const GET = withAuth(async (req, user, supabase) => {
  try {
    const result = await miFuncion(supabase, user.id)
    return ok(result)
  } catch (e) {
    console.error('[GET /api/mi-ruta]', { userId: user.id }, e)
    return err('Mensaje de error')
  }
})
```

**Routes de OAuth (`/api/auth/*`) — excluidas de `withAuth`:** son flujos de redirect pre-autenticación, no retornan JSON.

### Servicios (`lib/services/`)

| Archivo                      | Funciones clave                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `budgetService.ts`           | `fetchBudgets(supabase, userId, mes)` · `saveBudgets(supabase, userId, mes, items)`               |
| `advisorService.ts`          | `getInsights(supabase, userId, mes, force?)` · `sendChatMessage(supabase, userId, mes, message)`  |
| `transactionService.ts`      | `fetchMonthTransactions` · `createManualTransactions` · `batchCategorize` · `deleteTransaction`   |
| `syncService.ts`             | `runSync(userId, admin)` — pipeline completo Gmail→Supabase; `deduplicateUber` es privada al módulo |

**Regla:** las route handlers son transporte puro (auth → validar input → llamar service → responder). La lógica de negocio vive en `lib/services/`.

### Tabla de endpoints

| Ruta                                 | Método | Descripción                                                                  |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------- |
| `POST /api/sync`                     | POST   | Sincroniza emails nuevos de Gmail                                            |
| `GET /api/budgets`                   | GET    | Lee presupuestos del mes (`?mes=yyyy-MM`)                                    |
| `PUT /api/budgets`                   | PUT    | Guarda en batch. `monto=0` → elimina; `monto>0` → upsert                     |
| `GET /api/ai/insights`               | GET    | Insights del asesor. Cache por `context_hash`. `?force=true` lo salta        |
| `POST /api/ai/chat`                  | POST   | Chat conversacional. Incluye historial últimos 10 mensajes                   |
| `POST /api/transactions/manual`      | POST   | Crea transacciones manuales. `gmail_message_id = 'manual_' + uuid`           |
| `PATCH /api/transactions/categorize` | PATCH  | Actualiza categorías en batch                                                |
| `DELETE /api/transactions/[id]`      | DELETE | Elimina una transacción. Gmail → agrega a `skipped_ids`. Manual → solo borra |

---

## Tipos clave (`lib/types.ts`)

```typescript
type TipoTransaccion =
  | "COMPRA"
  | "TRANSFERENCIA_ENVIADA"
  | "TRANSFERENCIA_RECIBIDA"
  | "PAGO_SERVICIO"
  | "RETIRO"
  | "ABONO_DEUDA"
  | "INGRESO";

type Categoria =
  | "HOGAR"
  | "TRANSPORTE"
  | "SALIDAS"
  | "SALUD"
  | "SUSCRIPCIONES"
  | "COMPRAS_ONLINE"
  | "INVERSION"
  | "DONACIONES"
  | "EDUCACION"
  | "REEMBOLSABLE"
  | "TRANSFERENCIA"
  | "INGRESO"
  | "OTRO";

type Banco = "RAPPICARD" | "RAPPIPAY" | "OTRO";

type InsightTipo =
  | "alerta"
  | "consejo"
  | "positivo"
  | "proyeccion"
  | "observacion";
```

Utilidades: `formatCOP()` · `formatCOPCompact()` · `isIngreso()` · `isGasto()` · `CATEGORIA_LABELS`

---

## Sistema de diseño

### `styles/tokens.css`

**Modo oscuro (`:root`):**

- `--bg #0A0A0A` / `--surface rgba(28,28,28,0.72)` / `--surface-2 rgba(36,36,36,0.72)`
- `--border rgba(255,255,255,0.10)` / `--border-soft rgba(255,255,255,0.06)`
- `--text #FFFFFF` / `--text-muted #888888` / `--text-subtle #444444`
- `--green #4ADE80` / `--red #FF6B6B` / `--yellow #FCD34D` / `--blue #60A5FA` / `--purple #A78BFA`
- Cada color tiene `*-soft` para fondos de badges
- `--glass-blur: blur(24px) saturate(160%)`
- `--pill-bg: rgba(255,255,255,0.05)` — fondo del HeaderPill (dark)
- `--overlay: rgba(0,0,0,0.55)` — scrim de modales y bottom sheets

**Modo claro (`[data-theme="light"]`):** `--bg #FFFFFF`, colores adaptados, `*-soft` pasteles, `--pill-bg: rgba(0,0,0,0.04)`.

**Radios:**

| Token | Valor | Uso |
|---|---|---|
| `--radius-xs` | 4px | Progress chips, elementos tiny |
| `--radius-badge` | 6px | Badges inline, inputs, botones pequeños |
| `--radius-pill` | 10px | Inputs redondeados, botón send del chat |
| `--radius-sm` | 12px | Botones medianos, InsightCard |
| `--radius-md` | 18px | Alertas, cards secundarias |
| `--radius-lg` | 24px | Cards principales del dashboard |
| `--radius-xl` | 32px | Bottom sheets |

**Regla:** sin `box-shadow`, sin gradientes. Solo bordes `var(--border)`. Glass morphism via `backdropFilter`.

### `styles/utilities.css`

Clases reutilizables importadas en `globals.css`. No usar valores hardcodeados cuando existe una clase equivalente.

| Clase | Qué aplica | Cuándo usar |
|---|---|---|
| `.card` | surface + border + radius-lg + glass-blur + overflow hidden | Toda card del dashboard |
| `.input-field` | surface + border + radius-badge + color + outline:none + text-xs | Todo `<input>`, `<select>`, `<textarea>` |
| `.skeleton` | surface-2 + radius-badge + flex-shrink:0 | Placeholders de carga |

---

## Auth y tokens Gmail

Login solicita `email profile gmail.readonly` con `access_type: offline` y `prompt: consent`. Middleware protege `/dashboard/**`, redirige `/` si hay sesión activa.

---

## Clientes Supabase

- `lib/supabase/client.ts` — browser client para `'use client'`
- `lib/supabase/server.ts` — server client (async cookies) + `createAdminClient()` con service role + `getAuthUser()` helper (crea client + obtiene user en una llamada; usado en todas las API routes)
- `lib/utils/auditId.ts` — `generateAuditId(admin, userId, fecha)`: genera `MMDD-NN`. Usar siempre en loop `for` secuencial, no `Promise.all`, para evitar race condition en mismo día.

---

## Flujo de ramas

```
main               ← siempre deployable
feature/<nombre>   ← una por mejora, PR a main
```

**Reglas de git:**

- Nunca commit ni push automático
- Siempre en `feature/<nombre>`, nunca directo en `main`
- Avisar cuando sea buen momento: _"Buen momento para commit en `feature/xxx` — ¿lo hacemos?"_

---

## Bugs conocidos

- **`id_auditoria` con gaps** — si se borra y re-sincroniza, el contador reinicia desde -01.
- **Uber dedup solo dentro del mismo sync** — si pre-auth y cobro caen en syncs distintos no se comparan. Riesgo bajo (ambos emails llegan casi juntos).

---

## Roadmap: lo que falta antes de lanzar

### ✅ Refactor completado

**Data layer (`refactor/data-layer`):**

| Tarea                                                   | Estado |
| ------------------------------------------------------- | ------ |
| Eliminar `recharts` de `package.json`                   | ✅     |
| Eliminar `SyncButton.tsx`                               | ✅     |
| `BudgetEntry`/`BudgetSubcat` movidos a `lib/types.ts`   | ✅     |
| `GASTO_CATS` unificado → `PRESUPUESTO_CATS` en types    | ✅     |
| `SyncLog.skipped_ids` tipado, `PatrimonioItem` borrado  | ✅     |
| `StatsCards` colores hardcoded → CSS variables          | ✅     |
| `SpendingChart` stroke `#0A0A0A` → `var(--bg)`          | ✅     |
| `SpendingChart` `ABONO_DEUDA` removido de `TIPOS_GASTO` | ✅     |
| `generateAuditId` extraído a `lib/utils/auditId.ts`     | ✅     |
| Race condition `generateAuditId` corregida (for loop)   | ✅     |
| `getAuthUser()` helper — usado en todas las rutas API   | ✅     |

**API layer (`refactor/api-layer`):**

| Tarea                                                                          | Estado |
| ------------------------------------------------------------------------------ | ------ |
| `lib/api/response.ts` — helpers `ok()` / `err()`                              | ✅     |
| `lib/api/withAuth.ts` — middleware de autenticación para route handlers        | ✅     |
| `lib/services/budgetService.ts` — lógica de presupuestos                      | ✅     |
| `lib/services/advisorService.ts` — insights y chat del asesor IA              | ✅     |
| `lib/services/transactionService.ts` — CRUD de transacciones                  | ✅     |
| `lib/services/syncService.ts` — pipeline Gmail→Supabase + dedup Uber          | ✅     |
| 8 route handlers convertidos a transporte puro (auth → validar → service → ok) | ✅     |
| Routes de OAuth (`/api/auth/*`) dejadas intactas (no son JSON endpoints)       | ✅     |

**Components layer (`refactor/components`):**

| Tarea                                                                              | Estado |
| ---------------------------------------------------------------------------------- | ------ |
| `hooks/useSync.ts` — estado sync extraído de HeaderPill                           | ✅     |
| `hooks/useMonthNavigation.ts` — navegación de mes extraída de DashboardClient     | ✅     |
| `hooks/useTransactions.ts` — fetch de transacciones + SSR-aware                  | ✅     |
| `hooks/useTransactionsList.ts` — filtrado, delete optimista, batch categorías     | ✅     |
| `hooks/useBudgetManager.ts` — fetch, draft/saved pattern, normalize, save         | ✅     |
| `hooks/useAdvisor.ts` — insights fetch, chat state, refs scroll/focus             | ✅     |
| `hooks/useManualTransactions.ts` — draft rows, parseMonto, batch save             | ✅     |
| `components/ui/Skeleton.tsx` — `<Skeleton>` + `<SkeletonCard>` reutilizables     | ✅     |
| 6 componentes del dashboard refactorizados para usar sus hooks respectivos         | ✅     |

**Styles layer (`refactor/styles`):**

| Tarea                                                                              | Estado |
| ---------------------------------------------------------------------------------- | ------ |
| `styles/tokens.css` — nuevos tokens: `--radius-xs/badge/pill`, `--pill-bg`, `--overlay` | ✅     |
| `styles/utilities.css` — clases `.card`, `.input-field`, `.skeleton`              | ✅     |
| `app/globals.css` — import de utilities.css                                       | ✅     |
| Strokes del logo SVG → `var(--green)` (page.tsx + DashboardClient)                | ✅     |
| `HeaderPill` — radios → tokens, pill bg → `var(--pill-bg)`                        | ✅     |
| `BudgetManager` — `.card`, `.skeleton`, `.input-field`, radios → tokens           | ✅     |
| `AIAdvisorPanel` — `.card` en empty states + card principal, badges → `var(--radius-badge)`, chat → `var(--radius-pill)` | ✅     |
| `ManualTransactions` — `.card`, `.input-field` en todos los inputs/selects        | ✅     |
| `TransactionsList` — `.card`, overlay → `var(--overlay)`, delete btn → `var(--radius-badge)` | ✅     |

### ⬜ Testing unitario

| Tarea                                              | Prioridad | Notas                                                        |
| -------------------------------------------------- | --------- | ------------------------------------------------------------ |
| Configurar Vitest                                  | Alta      | No hay test runner aún. `npx tsc --noEmit` es el único check |
| Tests para parsers (`rappicard.ts`, `rappipay.ts`) | Alta      | Lógica más crítica y más fácil de testear con fixtures       |
| Tests para `guessCategoria()`                      | Alta      | 120+ patrones, tabla de casos entrada/salida esperada        |
| Tests para `deduplicateUber()`                     | Alta      | Lógica de negocio con edge cases de tiempo y monto           |
| Tests para `generateAuditId()`                     | Media     | Verificar secuencia y formato `MMDD-NN`                      |
| Tests de integración para API routes               | Baja      | Requiere mock de Supabase/Groq                               |

### ⬜ E2E con Maestro

Maestro (`maestro.mobile.dev`) — framework de E2E para PWAs y apps móviles. Corre flujos reales en el browser/simulador con YAML.

| Flujo a cubrir                           | Prioridad | Archivo sugerido                      |
| ---------------------------------------- | --------- | ------------------------------------- |
| Login con Google → llega al dashboard    | Alta      | `maestro/flows/login.yaml`            |
| Sync de emails → aparecen transacciones  | Alta      | `maestro/flows/sync.yaml`             |
| Agregar transacción manual               | Alta      | `maestro/flows/add_manual.yaml`       |
| Editar categoría de una transacción      | Media     | `maestro/flows/edit_category.yaml`    |
| Eliminar una transacción                 | Media     | `maestro/flows/delete_tx.yaml`        |
| Guardar presupuesto mensual              | Media     | `maestro/flows/save_budget.yaml`      |
| Ver insights del asesor IA               | Media     | `maestro/flows/ai_insights.yaml`      |
| Chat con el asesor                       | Baja      | `maestro/flows/ai_chat.yaml`          |
| Cambiar de mes en el dashboard           | Baja      | `maestro/flows/month_navigation.yaml` |

**Setup:** `brew install maestro` · `maestro test maestro/flows/login.yaml` · Requiere app corriendo en `:3000` o en simulador iOS/Android.

### ⬜ Accesibilidad (a11y)

Objetivo: cumplir WCAG 2.1 AA. Todos los elementos interactivos deben ser navegables por teclado y legibles por screen readers.

| Área                                    | Prioridad | Qué hacer                                                                          |
| --------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `aria-label` en botones icon-only       | Alta      | `HeaderPill`: sync, reset, theme, logout — solo tienen íconos, sin texto visible   |
| `role` y `aria-expanded` en colapsables | Alta      | `ManualTransactions`, `BudgetManager` (`<details>`), `AIAdvisorPanel` (chat)       |
| Contraste en modo claro                 | Alta      | Verificar `--text-muted` (#6B6B6B) sobre `--surface` — puede fallar ratio 4.5:1   |
| Focus visible en todos los botones      | Alta      | Muchos botones tienen `outline: none` — agregar `:focus-visible` con var(--border) |
| `alt` en imágenes SVG decorativas       | Media     | Logo SVG: `aria-hidden="true"` ya puesto; verificar el resto                       |
| Semántica de headings (`h1`→`h2`→`h3`) | Media     | Dashboard usa `<h2>` para secciones — verificar jerarquía                          |
| Tamaños mínimos de touch target (44px)  | Media     | Ya aplicado en MonthNav; revisar chips de categoría y filas de transacción         |
| `prefers-reduced-motion`                | Baja      | Animaciones CSS (`animate-spin`, transiciones) — envolver con media query          |

**Herramientas:** `axe-core` (browser extension) · `eslint-plugin-jsx-a11y` · Lighthouse accessibility audit.

### ⬜ Features pendientes

| Feature                                   | Componente / Ruta afectada                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Copiar presupuesto del mes anterior       | `BudgetManager` — botón que carga el mes previo                                                                    |
| Caché por comercio (Etapa 2)              | Nueva tabla `commerce_rules`                                                                                       |
| Groq fallback en categorización (Etapa 2) | `lib/parsers/commerceCategories.ts`                                                                                |
| Soporte Bancolombia                       | Nuevo `lib/parsers/bancolombia.ts` + sender en `BANK_SENDERS` (`lib/gmail/client.ts`) + registro en `lib/parsers/index.ts`. Bancolombia envía notificaciones desde `alertas@notificaciones.bancolombia.com.co` |

### ⬜ Deploy y distribución

| Decisión                 | Opciones                                                       | Recomendación                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting**              | Vercel (zero-config Next.js) vs Railway vs Fly.io              | **Vercel** — deploy automático desde `main`, dominio custom gratis en plan Hobby                                                               |
| **Dominio**              | `billeteclaro.app` (.app requiere HTTPS, ya cumplimos)         | Comprar en Namecheap o Google Domains (~$15/año). Conectar a Vercel en 2 pasos                                                                 |
| **Distribución móvil**   | PWA (ya configurada) vs app nativa (React Native) vs Capacitor | **PWA primero** — ya está en el proyecto (`@ducanh2912/next-pwa`). Instalable desde Chrome/Safari sin pasar por stores. App nativa es post-MVP |
| **OAuth en producción**  | Google Console → Authorized redirect URIs                      | Agregar `https://billeteclaro.app/api/auth/callback` y `https://billeteclaro.app/api/auth/gmail-callback`                                      |
| **Supabase URL en prod** | Ya usa `NEXT_PUBLIC_SUPABASE_URL`                              | Solo agregar las env vars en Vercel                                                                                                            |

**Orden recomendado para deploy:**

1. ~~Limpiar código muerto~~ ✅ hecho
2. `npm run build` sin errores
3. Crear proyecto en Vercel, conectar repo, agregar env vars
4. Comprar dominio y conectar
5. Actualizar Google OAuth con URLs de producción
6. Probar sync end-to-end en prod

---

## Decisiones tomadas

| Decisión                                           | Razón                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Groq + Llama 3.3 70B (extracción + asesor)         | 14.400 req/día gratis, ~200ms, JSON mode nativo                      |
| Parsers regex primero, Groq como fallback          | Sin costo para RappiCard/RappiPay (100% del MVP)                     |
| Fecha fija `after:2026/05/01` en Gmail             | Evita sync lenta de 365 días                                         |
| `ABONO_DEUDA` excluido de gastos                   | Pago de tarjeta no es gasto real                                     |
| `toTitleCase` en parsers Y en UI                   | Parsers limpian datos nuevos; UI limpia históricos en BD             |
| `cookies()` async en Next.js 15+                   | Cambio de API rompía `createClient`                                  |
| Uber pre-auths en `sync_log.skipped_ids`           | Evita filas fantasma; IDs excluidos en próximos syncs                |
| Dark mode como default                             | Preferencia del usuario; persiste en localStorage                    |
| CSS variables en lugar de Tailwind hardcodeado     | Un solo punto de verdad para colores; tema sin rerender              |
| Glass morphism (`--surface` rgba + `--glass-blur`) | Profundidad visual sin sombras                                       |
| `HeaderPill` unificado                             | Reduce ruido visual; sync/reset/theme/logout en una cápsula          |
| Subcategorías en `jsonb` de `budgets`              | No contamina `transactions`; son UI-only                             |
| Batch save en BudgetManager y TransactionsList     | El usuario controla cuándo persiste; menos calls API                 |
| `CategoryPicker` fuera del `backdropFilter` div    | `position:fixed` no funciona dentro de `backdropFilter` en WebKit    |
| `contextVersion` para invalidar cache del asesor   | Signal explícito; el hash del servidor decide si llama Groq o no     |
| Delete de transacción → `skipped_ids` para Gmail   | Sin esto, la transacción vuelve en el próximo sync                   |
| InsightCard: superficie neutra + borde de color    | Más legible que fondos de color sólido; diferencia tipos sin saturar |
| Tipo `observacion` en insights (púrpura, Eye)      | Diferencia "dato para pensar" de "acción concreta" (consejo)         |
| Cache de insights en `ai_insights` tabla           | Evita llamadas Groq redundantes; hash como invalidación exacta       |
| PWA antes que app nativa                                           | Ya está configurada; instalable sin stores; app nativa es post-MVP   |
| Sin notificaciones push en MVP                                     | Alta complejidad, bajo valor antes de tener usuarios reales          |
| `withAuth` + `ok()`/`err()` como infraestructura de routes         | Elimina boilerplate de auth y formato en cada handler; routes son transporte puro |
| Routes OAuth excluidas de `withAuth`                               | Son flujos de redirect pre-sesión; no retornan JSON y manejan estados intermedios |
| Lógica de negocio en `lib/services/`, no en route handlers         | Testeable de forma aislada; routes quedan de 15–30 líneas máximo     |
| Custom hooks en `hooks/` por componente                            | Separa lógica de render; hooks son testeables unitariamente; componentes quedan puros |
| No se usó Context para `activeFilter`                              | Solo 1 nivel de profundidad (DashboardClient → hijos directos); Context sería over-engineering |
| `useRef(isFirstRender)` en `useTransactions`                       | Evita re-fetch al montar cuando `initialTxs` viene del servidor (SSR); sin efecto visible |
| `.card`, `.input-field`, `.skeleton` en utilities.css              | Un solo punto de verdad para las superficies más repetidas; cambios de tema sin tocar JSX |
| `--overlay`, `--pill-bg` como tokens en lugar de rgba inline       | Permite ajustar scrims y superficies desde CSS; facilita overrides en light mode |
| `SpendingChart` mantiene colores hex en `CATEGORIA_COLORS`         | SVG `fill` attribute no acepta `var()` — CSS variables solo funcionan en `style` props |
| `mes_contable` persistido en BD, no calculado on-the-fly           | Permite filtrar con una query simple `.eq('mes_contable', m)`; el cálculo on-the-fly requeriría traer todo y filtrar en cliente |
| Re-computar `mes_contable` para meses completos en FASE 4          | El sueldo puede llegar en un sync distinto al de las transacciones del mismo período; re-computar con el set completo garantiza consistencia |
| `es_sueldo` marcado por referencia de objeto (no por valor)        | Dos transacciones con mismo timestamp+monto son posibles; la referencia identifica exactamente la detectada |
| Dashboard filtra por `mes_contable` en lugar de rango de `fecha`   | Un solo `.eq()` vs. `.gte()` + `.lte()`; además, transacciones de fin de mes anterior aparecen en el mes correcto |
