# BilleteClaro — Memoria del Proyecto

## Qué es

**BilleteClaro** — PWA de finanzas personales para Colombia. Lee automáticamente correos de notificación de bancos desde Gmail, extrae cada transacción con parsers específicos + IA como fallback, y presenta un dashboard financiero con asesor IA. El usuario no ingresa datos manualmente (a menos que quiera).

- Dominio objetivo: `billeteclaro.app`
- Mercado: Colombia (MVP)
- Supabase project ref: `txfnesqouciiiklhsjaw` (us-east-1)

---

## Mapa de etapas

- [x] **Etapa 1 — Recolección de datos** ← completa
- [x] **UI/UX base** ← completa (dark/light mode, glass morphism, sistema de diseño)
- [ ] **Etapa 2 — Categorización** (pendiente)
- [ ] **Etapa 3 — Asesor financiero IA** ← en progreso

### Criterios Etapa 1 — completados

| Criterio | Estado |
|---|---|
| Correos Rappi en Supabase sin duplicados | ✅ dedup por `gmail_message_id UNIQUE` |
| Uber sin doble cobro | ✅ `deduplicateUber()` — pre-auths en `sync_log.skipped_ids` |
| Datos persisten al cambiar sesión y mes | ✅ Supabase, no localStorage |
| Cada transacción tiene ID único MMDD-NN | ✅ `generateAuditId()` |
| Nombre del comercio es legible | ✅ `toTitleCase()` en parsers y en UI |
| Ingresos y egresos identificados correctamente | ✅ `isIngreso()`, `isGasto()` excluye `ABONO_DEUDA` |
| Botón sincronizar separado del delete | ✅ `HeaderPill` — sync y reset con confirmación 4s |

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

| Tabla | Propósito |
|---|---|
| `transactions` | Todas las transacciones. UNIQUE `(user_id, gmail_message_id)` |
| `sync_log` | Log de cada sync. `skipped_ids text[]` guarda IDs ignorados (Uber pre-auths, transacciones eliminadas) |
| `user_tokens` | `gmail_refresh_token` por usuario |
| `budgets` | `(user_id, mes, categoria, monto_presupuestado, subcategorias jsonb)`. UNIQUE `(user_id, mes, categoria)` |
| `ai_insights` | Cache de insights. UNIQUE `(user_id, mes)`. Columnas: `insights jsonb`, `context_hash`, `generated_at` |
| `chat_messages` | Historial del chat con el asesor. `role CHECK IN ('user','assistant')` |

### Migraciones aplicadas

| Archivo | Estado |
|---|---|
| `001_add_rappipay_simplify_bancos.sql` | ✅ aplicada |
| `002_budgets.sql` | ✅ aplicada |
| `003_ai_advisor.sql` | ✅ aplicada (tablas `ai_insights` + `chat_messages`) |
| `sync_log.skipped_ids` (ALTER manual) | ✅ aplicada |

### Puntos clave

- RLS habilitado en todas las tablas con `auth.uid() = user_id`
- `subcategorias` en `budgets` es `jsonb` — UI-only, no se refleja en `transactions`
- `id_auditoria` formato `MMDD-NN` — puede tener gaps si se borra y re-sincroniza
- `user_tokens.gmail_refresh_token` — se persiste en el callback de OAuth usando `createAdminClient()` (el `provider_refresh_token` de Supabase solo está disponible justo después del login)

---

## Sistema de diseño (`styles/tokens.css`)

CSS variables para dark (default) y light. Importado en `globals.css` antes de Tailwind.

**Modo oscuro (`:root`):**
- `--bg #0A0A0A` / `--surface rgba(28,28,28,0.72)` / `--surface-2 rgba(36,36,36,0.72)`
- `--border rgba(255,255,255,0.10)` / `--border-soft rgba(255,255,255,0.06)`
- `--text #FFFFFF` / `--text-muted #888888` / `--text-subtle #444444`
- `--green #4ADE80` / `--red #FF6B6B` / `--yellow #FCD34D` / `--blue #60A5FA` / `--purple #A78BFA`
- Cada color tiene su `*-soft` (color sólido oscuro) para fondos de badges
- `--glass-blur: blur(24px) saturate(160%)` — usado como `backdropFilter` en cards

**Modo claro (`[data-theme="light"]`):**
- `--bg #FFFFFF` / `--surface rgba(248,248,248,0.80)` / `--surface-2 rgba(240,240,240,0.80)`
- `--border rgba(0,0,0,0.09)` / `--border-soft rgba(0,0,0,0.05)`
- `--green #16A34A` / `--red #DC2626`
- Cada color tiene su `*-soft` (color suave pastel) para fondos de badges

**Tipografía:** variables `--text-xs` (11px) a `--text-3xl` (30px)
**Radio:** `--radius-sm` (12px) / `--radius-md` (18px) / `--radius-lg` (24px) / `--radius-xl` (32px)

**Regla de diseño:** sin sombras (`box-shadow: none`), sin gradientes. Solo bordes `var(--border)`. Glass morphism via `backdropFilter: var(--glass-blur)` en todas las cards.

### HeaderPill (`components/dashboard/HeaderPill.tsx`)
Cápsula unificada en el header del dashboard. Reemplaza `SyncButton` + `ThemeToggle` + botón logout por separado. Contiene: sync (con spinner/check/error) | reset con confirmación 4s | toggle sun/moon | logout. Background translúcido, height 36px, border-radius 10.

### Colores semánticos por categoría (UI)
```
TRANSPORTE    → --blue   / --blue-soft
SALIDAS       → --red    / --red-soft
HOGAR         → --green  / --green-soft
SALUD         → --green  / --green-soft
SUSCRIPCIONES → --purple / --purple-soft
COMPRAS_ONLINE→ --yellow / --yellow-soft
INVERSION     → --purple / --purple-soft
DONACIONES    → --blue   / --blue-soft
EDUCACION     → --yellow / --yellow-soft
INGRESO       → --green  / --green-soft
OTRO          → --text-muted / --surface-2
```

---

## Arquitectura del pipeline de sync

El flujo completo vive en `app/api/sync/route.ts` (POST):

```
Gmail OAuth refresh → listBankMessageIds() → filtrar ya procesados
  (processedIds = gmail_message_ids de transactions + todos los skipped_ids de sync_log)
→ FASE 1: por cada email nuevo:
    trySpecificParser(banco, email)   ← rápido, sin costo de API
    └─ null → extractWithGroq()       ← fallback IA, concurrencia=3
→ FASE 2: deduplicateUber() sobre TODAS las transacciones del sync
    → pre-auths de Uber → guardados en sync_log.skipped_ids
→ FASE 3: upsert en transactions (ignoreDuplicates: true)
→ log: "[sync] N emails — X parser | Y Groq | Z omitidos | W Uber preauth | E errores"
→ actualizar sync_log (finished_at, skipped_ids, status)
```

**Límites:** máx 2000 emails por sync, búsqueda desde `after:2026/05/01` (fecha fija).

### Eliminación de transacción individual (`DELETE /api/transactions/[id]`)

- Verifica ownership (`user_id`) antes de borrar
- Si es transacción de Gmail: inserta fila en `sync_log` con `skipped_ids = [gmail_message_id]` para que el próximo sync la ignore
- Si es transacción manual (`gmail_message_id` starts with `'manual_'`): solo borra de DB

---

## Detección de bancos (`lib/gmail/client.ts`)

| Sender | Banco |
|---|---|
| `noreply@rappicard.co` | RAPPICARD |
| `noreply@rappipay.co` | RAPPIPAY |
| `noreply@holdingrappipay.co` | RAPPIPAY |

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
- `positivo`: gasto significativamente menor al esperado — formato con Z = (limite - gastado) / dias_restantes * 7
- Si presupuesto excedido: nunca "máximo $0 más" — mostrar exceso + consecuencia + comercio top
- Sin frases: "Considera reducir", "Podrías intentar", "Sería recomendable"
- REGLA ANTI-DUPLICADOS: un solo insight por categoría (fusionar alerta + consejo)

---

## Dashboard (`app/dashboard/`)

### `DashboardClient.tsx` — estado global

```
txs            — transacciones del mes (recargadas por loadMonth)
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

### Componentes (`components/dashboard/`)

**`HeaderPill`** — sync | reset (confirmación 4s) | theme toggle | logout. Cápsula translúcida 36px.

**`StatsCards`** — Balance hero full-width + Gastos/Ingresos en fila de 2.

**`SpendingChart`** — donut SVG propio (sin Recharts). Slices y leyenda clickeables → filtra `TransactionsList` via `activeFilter`.

**`BudgetManager`** — patrón `saved` (DB) + `draft` (local) + botón "Guardar" único. `isDirty` usa `normalize()` para ignorar subcats vacías. Llama `onSaved()` → `bumpContext()` en DashboardClient.

**`AIAdvisorPanel`** — auto-fetch en mount si `budgetCount >= 1 && txCount >= 5`. Re-fetch cuando cambia `contextVersion`. InsightCard: superficie neutra + borde izquierdo de color + badge de tipo + badge de categoría. Skeleton imita la estructura real de InsightCard. Chat expandible con `ThinkingDots`.

**`ManualTransactions`** — panel colapsable. Campos: fecha, monto, comercio, tipo, banco, categoría. Batch POST.

**`TransactionsList`** — buscador + 3 chips fijos + bottom sheet de categorías. Fila: dot + nombre + chip de categoría clickeable + banco + hora + monto + papelera. Delete con confirmación 2s inline. `deletedIds: Set<string>` para remoción optimista. `CategoryPicker` renderizado fuera del contenedor `backdropFilter` (fix WebKit `position:fixed`). Batch save de categorías.

---

## API Routes

- `lib/supabase/client.ts` — browser client, usado en `'use client'`
- `lib/supabase/server.ts` — server client (async, cookies) + `createAdminClient()` con service role

---

## Dashboard

`app/dashboard/page.tsx` — Server Component, fetcha transacciones del mes, pasa a `DashboardClient.tsx`.

`app/dashboard/DashboardClient.tsx` — Client Component. Maneja navegación de mes, logout, refresco post-sync. `buildStats()` deriva gastos/ingresos/balance con `useMemo`.

### Componentes UI (`components/dashboard/`)

- **`StatsCards`** — Balance como hero card full-width (número grande, badge "positivo"/"negativo") + Gastos/Ingresos en fila secundaria de 2 columnas
- **`SpendingChart`** — donut SVG propio (sin Recharts), slices y leyenda clickeables → filtra `TransactionsList` via `activeFilter` compartido en `DashboardClient`. Barras proporcionales con % en leyenda. Top 8 categorías de gasto
- **`HeaderPill`** — cápsula unificada: sync + reset + theme toggle + logout. Reemplaza `SyncButton` y `ThemeToggle` por separado.
- **`TransactionsList`** — buscador + 3 chips fijos (Todos / RappiCard / RappiPay) + bottom sheet de categorías (`▾`) + barra de resumen + lista agrupada por fecha. Filas estilo "strip": borde izquierdo de color de categoría + dot. `activeFilter` recibido como prop desde `DashboardClient`

### Estado compartido: `activeFilter`
`DashboardClient` gestiona `useState<string>('TODOS')` y lo pasa a `SpendingChart` y `TransactionsList`. Tocar un slice del donut o un chip de categoría actualiza ambos componentes. Se resetea a `'TODOS'` al cambiar de mes.

### Lógica de display en TransactionsList

- `getDisplayName(t)` — nombres contextuales según `tipo`
- `efectivoBanco(t)` — `ABONO_DEUDA` mapea a RAPPIPAY (el pago sale de la RappiCuenta)
- `groupByDate(txs)` — agrupa por `"d de MMMM"` para los headers de fecha
- Barra de resumen muestra total gastos y/o ingresos del filtro activo

---

## Tipos clave (`lib/types.ts`)

```typescript
type TipoTransaccion = 'COMPRA' | 'TRANSFERENCIA_ENVIADA' | 'TRANSFERENCIA_RECIBIDA'
                     | 'PAGO_SERVICIO' | 'RETIRO' | 'ABONO_DEUDA' | 'INGRESO'

type Categoria = 'HOGAR' | 'TRANSPORTE' | 'SALIDAS' | 'SALUD' | 'SUSCRIPCIONES'
               | 'COMPRAS_ONLINE' | 'INVERSION' | 'DONACIONES' | 'EDUCACION'
               | 'REEMBOLSABLE' | 'TRANSFERENCIA' | 'INGRESO' | 'OTRO'

type Banco = 'RAPPICARD' | 'RAPPIPAY' | 'OTRO'

type InsightTipo = 'alerta' | 'consejo' | 'positivo' | 'proyeccion' | 'observacion'
```

Utilidades: `formatCOP()` · `formatCOPCompact()` · `isIngreso()` · `isGasto()` · `CATEGORIA_LABELS`

---

## Sistema de diseño (`styles/tokens.css`)

**Modo oscuro (`:root`):**
- `--bg #0A0A0A` / `--surface rgba(28,28,28,0.72)` / `--surface-2 rgba(36,36,36,0.72)`
- `--border rgba(255,255,255,0.10)` / `--border-soft rgba(255,255,255,0.06)`
- `--text #FFFFFF` / `--text-muted #888888` / `--text-subtle #444444`
- `--green #4ADE80` / `--red #FF6B6B` / `--yellow #FCD34D` / `--blue #60A5FA` / `--purple #A78BFA`
- Cada color tiene `*-soft` para fondos de badges
- `--glass-blur: blur(24px) saturate(160%)`

**Modo claro (`[data-theme="light"]`):** `--bg #FFFFFF`, colores adaptados, `*-soft` pasteles.

**Radios:** `--radius-sm` 12px · `--radius-md` 18px · `--radius-lg` 24px · `--radius-xl` 32px

**Regla:** sin `box-shadow`, sin gradientes. Solo bordes `var(--border)`. Glass morphism via `backdropFilter`.

---

## Auth y tokens Gmail

Login solicita `email profile gmail.readonly` con `access_type: offline` y `prompt: consent`. Middleware protege `/dashboard/**`, redirige `/` si hay sesión activa.

---

## Clientes Supabase

- `lib/supabase/client.ts` — browser client para `'use client'`
- `lib/supabase/server.ts` — server client (async cookies) + `createAdminClient()` con service role

---

## Flujo de ramas

```
main               ← siempre deployable
feature/<nombre>   ← una por mejora, PR a main
```

**Reglas de git:**
- Nunca commit ni push automático
- Siempre en `feature/<nombre>`, nunca directo en `main`
- Avisar cuando sea buen momento: *"Buen momento para commit en `feature/xxx` — ¿lo hacemos?"*

---

## Bugs conocidos

- **`id_auditoria` con gaps** — si se borra y re-sincroniza, el contador reinicia desde -01.
- **Uber dedup solo dentro del mismo sync** — si pre-auth y cobro caen en syncs distintos no se comparan. Riesgo bajo (ambos emails llegan casi juntos).
- **`recharts` en `package.json`** — instalado pero no usado (el donut es SVG propio). Pendiente eliminar.

---

## Roadmap: lo que falta antes de lanzar

### ⬜ QA y calidad de código

| Tarea | Prioridad | Notas |
|---|---|---|
| Eliminar `recharts` de `package.json` | Alta | No se usa, solo peso |
| Eliminar `SyncButton.tsx` y `ThemeToggle.tsx` | Alta | Reemplazados por `HeaderPill`, archivos muertos |
| Configurar Vitest o Jest | Media | No hay test runner aún. `npx tsc --noEmit` es el único check |
| Tests para parsers (`rappicard.ts`, `rappipay.ts`) | Media | Son la lógica más crítica y más fácil de testear con mocks |
| Tests para `guessCategoria()` | Media | 120+ patrones, fácil de verificar con tabla de casos |
| Tests para `deduplicateUber()` | Media | Lógica de negocio con edge cases |
| Tests de integración para API routes | Baja | Requiere mock de Supabase/Groq |
| Revisar y limpiar `SyncButton.tsx` obsoleto | Alta | |

### ⬜ Features pendientes

| Feature | Componente afectado |
|---|---|
| Copiar presupuesto del mes anterior | `BudgetManager` — botón que carga el mes previo |
| Caché por comercio (Etapa 2) | Nueva tabla `commerce_rules` |
| Groq fallback en categorización (Etapa 2) | `lib/parsers/commerceCategories.ts` |

### ⬜ Deploy y distribución

| Decisión | Opciones | Recomendación |
|---|---|---|
| **Hosting** | Vercel (zero-config Next.js) vs Railway vs Fly.io | **Vercel** — deploy automático desde `main`, dominio custom gratis en plan Hobby |
| **Dominio** | `billeteclaro.app` (.app requiere HTTPS, ya cumplimos) | Comprar en Namecheap o Google Domains (~$15/año). Conectar a Vercel en 2 pasos |
| **Distribución móvil** | PWA (ya configurada) vs app nativa (React Native) vs Capacitor | **PWA primero** — ya está en el proyecto (`@ducanh2912/next-pwa`). Instalable desde Chrome/Safari sin pasar por stores. App nativa es post-MVP |
| **OAuth en producción** | Google Console → Authorized redirect URIs | Agregar `https://billeteclaro.app/api/auth/callback` y `https://billeteclaro.app/api/auth/gmail-callback` |
| **Supabase URL en prod** | Ya usa `NEXT_PUBLIC_SUPABASE_URL` | Solo agregar las env vars en Vercel |

**Orden recomendado para deploy:**
1. Limpiar código muerto (`recharts`, `SyncButton`, `ThemeToggle`)
2. `npm run build` sin errores
3. Crear proyecto en Vercel, conectar repo, agregar env vars
4. Comprar dominio y conectar
5. Actualizar Google OAuth con URLs de producción
6. Probar sync end-to-end en prod

---

## Decisiones tomadas

| Decisión | Razón |
|---|---|
| Groq + Llama 3.3 70B (extracción + asesor) | 14.400 req/día gratis, ~200ms, JSON mode nativo |
| Parsers regex primero, Groq como fallback | Sin costo para RappiCard/RappiPay (100% del MVP) |
| Fecha fija `after:2026/05/01` en Gmail | Evita sync lenta de 365 días |
| `ABONO_DEUDA` excluido de gastos | Pago de tarjeta no es gasto real |
| `toTitleCase` en parsers Y en UI | Parsers limpian datos nuevos; UI limpia históricos en BD |
| `cookies()` async en Next.js 15+ | Cambio de API rompía `createClient` |
| Uber pre-auths en `sync_log.skipped_ids` | Evita filas fantasma en `transactions`; IDs excluidos en próximos syncs |
| Dark mode como default | Preferencia del usuario; se persiste en localStorage |
| CSS variables en lugar de clases Tailwind hardcodeadas | Permite cambio de tema sin rerender; un solo punto de verdad para colores |
| Demo page eliminada | Sin usuarios externos aún; simplifica el codebase |
| Glass morphism en cards (`--surface` rgba + `--glass-blur`) | Profundidad visual sin sombras; consistente con regla de diseño |
| `HeaderPill` unificado en lugar de botones separados | Reduce ruido visual en el header; sync/reset/theme/logout en una cápsula |
| Radios más grandes (`--radius-lg: 24px`, `--radius-xl: 32px`) | Look más fluido y moderno; coherente con el glass morphism |

---

## Bugs conocidos

- **`id_auditoria` puede tener gaps**: si se borra y re-sincroniza, el contador reinicia desde -01.
- **Uber dedup solo opera dentro del mismo sync**: si pre-auth y cobro caen en syncs distintos, no se comparan. Riesgo bajo porque ambos emails llegan casi juntos.

---

## Plan Etapa 2 — Categorización (pendiente)

Categorización automática ya está parcialmente implementada via `guessCategoria()` en `lib/parsers/commerceCategories.ts` (120+ patrones). Lo que falta:

1. **Edición manual de categoría** por transacción, con opción de aplicar al mismo comercio en bulk
2. **Caché por comercio** — si el usuario cambia la categoría de "Uber" una vez, se aplica a todas las futuras
3. **Gemini como último recurso** — para comercios no reconocidos por los patrones

## Etapa 3 — Asesor financiero IA (en progreso)

### Alcance
- Presupuesto mensual por categoría (configurable por el usuario)
- Alertas: 80%/100% de presupuesto, fragmentación Uber, gastos nocturnos
- IA conversacional con Gemini — contexto: gastos vs presupuesto por mes
- Tono: directo, colombiano, máximo 3 bullets por respuesta

### Plan de implementación

1. **BD: tabla `budgets`** — `user_id`, `categoria`, `monto_limite`, `mes` (o sin mes = recurrente)
2. **API `/api/budgets`** — GET/POST/PATCH para leer y guardar presupuestos
3. **UI: pantalla de presupuestos** — lista de categorías con input de monto límite por categoría
4. **Alertas en dashboard** — badge/banner cuando gasto ≥ 80% o 100% del presupuesto
5. **API `/api/advisor`** — POST recibe pregunta del usuario, construye contexto (gastos del mes, presupuestos, % consumido por categoría) y llama a Gemini
6. **UI: chat flotante** — botón en dashboard abre un mini-chat, respuestas en bullets
