# BilleteClaro — Memoria del Proyecto

## Qué es

**BilleteClaro** — PWA de finanzas personales para Colombia. Lee automáticamente correos de notificación de bancos desde Gmail, extrae cada transacción con parsers específicos + IA como fallback, y presenta un dashboard financiero minimalista. El usuario no hace nada manualmente.

- Dominio objetivo: `billeteclaro.app`
- Mercado: Colombia (MVP)
- Supabase project ref: `txfnesqouciiiklhsjaw` (us-east-1)

---

## Estado de las etapas

- [x] **Etapa 1 — Recolección de datos** ← completa (pendientes menores de UX)
- [x] **UI/UX base** ← completa (dark/light mode, sistema de diseño)
- [ ] **Etapa 2 — Categorización** (pendiente confirmación)
- [ ] **Etapa 3 — Asesor financiero IA** (pendiente confirmación)

### Criterios Etapa 1 — estado actual

| Criterio | Estado |
|---|---|
| Todos los correos Rappi en Supabase sin duplicados | ✅ dedup por `gmail_message_id UNIQUE` |
| Uber sin doble cobro | ✅ `deduplicateUber()` — pre-auths guardados en `sync_log.skipped_ids` |
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

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 App Router + Turbopack |
| Base de datos | Supabase (PostgreSQL, us-east-1) |
| Auth | Supabase Auth + Google OAuth |
| Email | Gmail API v1 (`gmail.readonly`) |
| IA / extracción | Gemini API — modelo `gemini-2.0-flash-lite` |
| UI | Tailwind CSS + CSS variables + Recharts (PieChart) |
| Iconos | lucide-react |
| Temas | next-themes (`data-theme` attribute, defaultTheme: "dark") |
| Fuente | Inter via `next/font/google` (variable `--font-inter`) |
| PWA | @ducanh2912/next-pwa (deshabilitado en dev) |

---

## Sistema de diseño (`styles/tokens.css`)

CSS variables para dark (default) y light. Importado en `globals.css` antes de Tailwind.

**Modo oscuro (`:root`):**
- `--bg #0A0A0A` / `--surface #1C1C1C` / `--surface-2 #242424`
- `--border #2E2E2E` / `--border-soft #222222`
- `--text #FFFFFF` / `--text-muted #888888` / `--text-subtle #444444`
- `--green #4ADE80` / `--red #FF6B6B` / `--yellow #FCD34D` / `--blue #60A5FA` / `--purple #A78BFA`
- Cada color tiene su `*-soft` (~18% opacidad) para fondos de badges

**Modo claro (`[data-theme="light"]`):**
- `--bg #FFFFFF` / `--surface #F8F8F8` / `--surface-2 #F0F0F0`
- `--border #E8E8E8`
- `--green #16A34A` / `--red #DC2626`

**Tipografía:** variables `--text-xs` (11px) a `--text-3xl` (30px)
**Radio:** `--radius-sm` (6px) a `--radius-xl` (20px)

**Regla de diseño:** sin sombras (`box-shadow: none`), sin gradientes. Solo bordes `var(--border)`.

### ThemeToggle (`components/ui/ThemeToggle.tsx`)
Pill 72×32px con círculo deslizante. Sol (izquierda = light) / Luna (derecha = dark). Visible en header de `/dashboard` y en `/` (esquina superior derecha). Persiste en `localStorage` key `billeteclaro-theme`. Sin flash gracias a `suppressHydrationWarning` en `<html>`.

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
  (processedIds incluye gmail_message_ids de transactions + skipped_ids de sync_log)
→ FASE 1: por cada email nuevo:
    trySpecificParser(banco, email)  ← rápido, sin costo
    └─ null → extractWithGroq()      ← fallback Gemini, concurrencia=3
→ FASE 2: deduplicateUber() sobre TODAS las transacciones
    → pre-auths de Uber → guardados en sync_log.skipped_ids (no en transactions)
→ FASE 3: upsert en transactions
→ console.log resumen: "X emails — Y parser | Z Gemini | W omitidos | ..."
→ actualizar sync_log (con skipped_ids)
```

**Deduplicación de emails:** constraint `UNIQUE(user_id, gmail_message_id)`. Upsert con `ignoreDuplicates: true`. Re-sincronizar es seguro.

**Deduplicación Uber:** si 2 Uber en el mismo sync con diferencia < 2h y montos < 20% de diferencia → la más temprana es pre-autorización. Su ID se guarda en `sync_log.skipped_ids`, nunca entra en `transactions`. El próximo sync lo excluye automáticamente.

**Logging de sync:** el servidor imprime cuántos emails procesó cada fuente:
```
[sync] 143 emails — 140 parser | 3 Gemini | 2 omitidos | 1 Uber preauth | 0 errores
```

**Límites:** máx 2000 emails por sync, búsqueda desde `after:2026/05/01` (fecha fija).

---

## Detección de bancos (`lib/gmail/client.ts`)

| Email sender | Banco |
|---|---|
| `noreply@rappicard.co` | RAPPICARD |
| `noreply@rappipay.co` | RAPPIPAY |
| `noreply@holdingrappipay.co` | RAPPIPAY |

---

## Parsers específicos (`lib/parsers/`)

- `rappicard.ts` — `parsePurchase` (tipo=`COMPRA`) + `parsePayment` (tipo=`ABONO_DEUDA`)
- `rappipay.ts` — `parseTransferenciaRecibida`, `parseTransferenciaEnviada`, `parseIngresoBancario`, `parsePagoServicio`, `parseRentabilidad`
- `commerceCategories.ts` — `guessCategoria(comercio)`: 120+ patrones de comercios colombianos. SALIDAS antes de TRANSPORTE para que "rappi" no matchee TRANSPORTE.

`trySpecificParser(banco, email)` devuelve `null` si el banco no tiene parser → señal para Gemini.

**Para agregar un banco nuevo:** crear `lib/parsers/mibanaco.ts`, registrar en `lib/parsers/index.ts`, agregar sender en `BANK_SENDERS` en `lib/gmail/client.ts`.

---

## Extractor IA (`lib/ai/extractor.ts`)

Función `extractWithGroq` (nombre histórico, usa Gemini internamente). Recibe `{from, subject, date, body, banco}`, manda 800 chars del body a `gemini-2.0-flash-lite` con `responseMimeType: 'application/json'` y `temperature: 0.1`. Retorna `null` si Gemini responde `{"error": "not_a_transaction"}` o si `monto <= 0`.

---

## Base de datos — puntos clave

- `sync_log` tiene columna `skipped_ids text[] DEFAULT '{}'` (migración manual aplicada). Guarda IDs de Gmail ignorados (Uber pre-auths) para que el siguiente sync no los reprocese.
- Todos los enums (`banco`, `tipo`, `categoria`) tienen CHECK constraints en BD **y** tipos TypeScript en `lib/types.ts`. Cambios requieren migración en `supabase/migrations/`.
- `user_tokens` guarda `gmail_refresh_token`. El `provider_refresh_token` de Supabase solo está disponible justo después del login — se persiste en el callback usando el admin client.
- RLS habilitado en todas las tablas con política `auth.uid() = user_id`.
- `id_auditoria` formato `MMDD-NN` — puede tener gaps si se borra y re-sincroniza.

---

## Auth y tokens Gmail

Login solicita scopes `email profile gmail.readonly` con `access_type: offline` y `prompt: consent`. El middleware protege `/dashboard/**` y redirige `/` si ya hay sesión.

---

## Clientes Supabase

- `lib/supabase/client.ts` — browser client, usado en `'use client'`
- `lib/supabase/server.ts` — server client (async, cookies) + `createAdminClient()` con service role

---

## Dashboard

`app/dashboard/page.tsx` — Server Component, fetcha transacciones del mes, pasa a `DashboardClient.tsx`.

`app/dashboard/DashboardClient.tsx` — Client Component. Maneja navegación de mes, logout, refresco post-sync. `buildStats()` deriva gastos/ingresos/balance con `useMemo`.

### Componentes UI (`components/dashboard/`)

- **`StatsCards`** — 3 cards: Gastos (rojo), Ingresos (verde), Balance
- **`SpendingChart`** — donut chart con leyenda (Recharts). Solo gastos reales, top 8 categorías
- **`SyncButton`** — estados: idle / syncing / done / error. Botón de reset separado con confirmación de 4s
- **`TransactionsList`** — buscador minimalista + carrusel de filtros (16 chips) + barra de resumen con totales por filtro + lista agrupada por fecha con separadores finos

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
```

- `formatCOP(amount)` → `$45.000`
- `formatCOPCompact(amount)` → `$1.2M` / `$450K`
- `isIngreso(tipo)` → true para INGRESO y TRANSFERENCIA_RECIBIDA
- `isGasto(tipo)` → true para todo excepto ingresos y ABONO_DEUDA

---

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL          # Supabase Session Pooler
GOOGLE_CLIENT_ID
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

---

## Decisiones tomadas

| Decisión | Razón |
|---|---|
| Gemini 2.0 Flash Lite para extracción | Misma cuenta Google del OAuth, gratis 1500 req/día, JSON nativo |
| Parsers regex primero, Gemini como fallback | Sin costo para RappiCard/RappiPay (100% del MVP) |
| Fecha fija `after:2026/05/01` en Gmail | Evita sync lenta de 365 días |
| `ABONO_DEUDA` excluido de gastos | Pago de tarjeta no es gasto real |
| `toTitleCase` en parsers Y en UI | Parsers limpian datos nuevos; UI limpia históricos en BD |
| Botón borrar separado del sync | Evitar delete+sync accidental |
| `cookies()` async en Next.js 15+ | Cambio de API rompía `createClient` |
| Uber pre-auths en `sync_log.skipped_ids` | Evita filas fantasma en `transactions`; IDs excluidos en próximos syncs |
| Dark mode como default | Preferencia del usuario; se persiste en localStorage |
| CSS variables en lugar de clases Tailwind hardcodeadas | Permite cambio de tema sin rerender; un solo punto de verdad para colores |
| Demo page eliminada | Sin usuarios externos aún; simplifica el codebase |

---

## Bugs conocidos

- **`id_auditoria` puede tener gaps**: si se borra y re-sincroniza, el contador reinicia desde -01.
- **Uber dedup solo opera dentro del mismo sync**: si pre-auth y cobro caen en syncs distintos, no se comparan. Riesgo bajo porque ambos emails llegan casi juntos.

---

## Pendientes Etapa 1 (UX menores)

1. **"Sincronizado hace X minutos"** — timestamp del último sync en el header
2. **Sync automática al abrir** — solo si `last_sync` tiene más de 15 min
3. **Cooldown en botón sync** — deshabilitar 30s después de cada sync

---

## Plan Etapa 2 — Categorización (cuando se confirme)

Categorización automática ya está parcialmente implementada via `guessCategoria()` en `lib/parsers/commerceCategories.ts` (120+ patrones). Lo que falta:

1. **Edición manual de categoría** por transacción, con opción de aplicar al mismo comercio en bulk
2. **Caché por comercio** — si el usuario cambia la categoría de "Uber" una vez, se aplica a todas las futuras
3. **Gemini como último recurso** — para comercios no reconocidos por los patrones

## Plan Etapa 3 — Asesor financiero IA (cuando se confirme)

- Presupuesto mensual por categoría (configurable)
- Alertas: 80%/100% de presupuesto, fragmentación Uber, gastos nocturnos
- IA conversacional con Gemini — contexto: gastos vs presupuesto por mes
- Tono: directo, colombiano, máximo 3 bullets por respuesta
