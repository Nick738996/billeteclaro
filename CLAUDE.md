# BilleteClaro — Memoria del Proyecto

## Qué es

**BilleteClaro** — PWA de finanzas personales para Colombia. Lee automáticamente correos de notificación de bancos desde Gmail, extrae cada transacción con parsers específicos + IA como fallback, y presenta un dashboard financiero con asesor IA.

- Dominio: `billeteclaro.com` (comprado en Cloudflare)
- Mercado: Colombia (MVP)
- Supabase project ref: `txfnesqouciiiklhsjaw` (us-east-1)

---

## Stack

| Capa                   | Tecnología                                                          |
| ---------------------- | ------------------------------------------------------------------- |
| Framework              | Next.js 16 App Router + Turbopack                                   |
| Base de datos          | Supabase (PostgreSQL, us-east-1)                                    |
| Auth                   | Supabase Auth + Google OAuth                                        |
| Email                  | Gmail API v1 (`gmail.readonly`)                                     |
| IA / extracción emails | Groq API — `llama-3.3-70b-versatile`, `temperature: 0.1`            |
| IA / asesor            | Groq API — `llama-3.3-70b-versatile`, JSON mode / `temperature: 0.4` |
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
npm test           # 87 tests (Vitest)
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
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GROQ_API_KEY               # console.groq.com — gratis, 100k tokens/día
NEXT_PUBLIC_APP_URL
```

---

## Base de datos

| Tabla           | Propósito                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `transactions`  | Todas las transacciones. UNIQUE `(user_id, gmail_message_id)`. Columnas `mes_contable` y `es_sueldo`      |
| `sync_log`      | Log de cada sync. `skipped_ids text[]` guarda IDs ignorados (Uber pre-auths, transacciones eliminadas)    |
| `user_tokens`   | `gmail_refresh_token` por usuario                                                                         |
| `budgets`       | `(user_id, mes, categoria, monto_presupuestado, subcategorias jsonb)`. UNIQUE `(user_id, mes, categoria)` |
| `ai_insights`   | Cache de insights. UNIQUE `(user_id, mes)`. Columnas: `insights jsonb`, `context_hash`, `generated_at`    |
| `chat_messages` | Historial del chat con el asesor. `role CHECK IN ('user','assistant')`                                    |
| `user_settings` | `onboarding_completed boolean DEFAULT false`                                                              |

- RLS habilitado en todas las tablas con `auth.uid() = user_id`
- `id_auditoria` formato `MMDD-NN` — puede tener gaps si se borra y re-sincroniza

---

## Detección de bancos (`lib/gmail/client.ts`)

| Sender                                                 | Banco       |
| ------------------------------------------------------ | ----------- |
| `noreply@rappicard.co`                                 | RAPPICARD   |
| `noreply@rappipay.co`                                  | RAPPIPAY    |
| `noreply@holdingrappipay.co`                           | RAPPIPAY    |
| `alertasynotificaciones@an.notificacionesbancolombia.com` | BANCOLOMBIA |
| `alertasynotificaciones@notificacionesbancolombia.com` | BANCOLOMBIA |

**Para agregar un banco nuevo:** crear `lib/parsers/mibanaco.ts`, registrar en `lib/parsers/index.ts`, agregar sender en `BANK_SENDERS` en `lib/gmail/client.ts`.

---

## Parsers específicos (`lib/parsers/`)

- `rappicard.ts` — `parsePurchase` (COMPRA) + `parsePayment` (ABONO_DEUDA)
- `rappipay.ts` — transferencias, ingresos, pagos, rentabilidad
- `bancolombia.ts` — Compra, Transferencia enviada/recibida, Pago QR. Emails en formato de oraciones (no tablas)
- `commerceCategories.ts` — `guessCategoria(comercio)`: 120+ patrones colombianos

`trySpecificParser(banco, email)` devuelve `null` → fallback a Groq.

---

## Pipeline de sync (`app/api/sync/route.ts` → `lib/services/syncService.ts`)

```
Gmail OAuth refresh → listBankMessageIds() → filtrar ya procesados
  (processedIds = gmail_message_ids de transactions + todos los skipped_ids de sync_log)
→ FASE 1: trySpecificParser() → null → omitido (sin fallback IA — Groq reservado para el asesor)
→ FASE 2: deduplicateUber() — pre-auths → sync_log.skipped_ids
→ FASE 3: upsert en transactions (ignoreDuplicates: true)
→ FASE 4: asignar mes_contable para meses afectados
```

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

> `SpendingChart` usa colores hex en `CATEGORIA_COLORS` porque SVG `fill` no acepta `var()`.

---

## Tipos clave (`lib/types.ts`)

```typescript
type Categoria = 'HOGAR' | 'TRANSPORTE' | 'SALIDAS' | 'SALUD' | 'SUSCRIPCIONES'
  | 'COMPRAS_ONLINE' | 'INVERSION' | 'AHORROS' | 'DEUDA' | 'DONACIONES'
  | 'EDUCACION' | 'REEMBOLSABLE' | 'TRANSFERENCIA' | 'INGRESO' | 'OTRO'

type Banco = 'RAPPICARD' | 'RAPPIPAY' | 'BANCOLOMBIA' | 'OTRO'

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

- **`id_auditoria` con gaps** — si se borra y re-sincroniza, el contador reinicia desde -01.
- **Uber dedup solo dentro del mismo sync** — si pre-auth y cobro caen en syncs distintos no se comparan.
- **Bancolombia emails con imágenes** — algunos emails de Bancolombia tienen URLs de imagen antes del texto de transacción; los parsers deberían manejarlos pero si Groq está en rate limit quedan como omitidos.

---

## Lo que falta antes de lanzar

### ⬜ Etapa 2 — Categorización inteligente (parcial)

- [x] `guessCategoria()` con 120+ patrones — `lib/parsers/commerceCategories.ts`
- [ ] **Caché por comercio** — nueva tabla `commerce_rules`. Si el usuario cambia "Uber" a TRANSPORTE una vez, se aplica siempre en futuros syncs. (El fallback Groq fue removido — Groq reservado para el asesor.)

### ⬜ Accesibilidad (a11y) — WCAG 2.1 AA

| Área                                    | Archivos                                                         |
| --------------------------------------- | ---------------------------------------------------------------- |
| `role` y `aria-expanded` en colapsables | `ManualTransactions.tsx`, `BudgetManager.tsx`, `AIAdvisorPanel.tsx` (chat) |
| Contraste modo claro                    | Verificar `--text-muted` (#6B6B6B) sobre `--surface` — ratio 4.5:1 |
| Semántica de headings (h1→h2→h3)        | Dashboard — verificar jerarquía                                  |
| Touch targets 44px                      | Chips de categoría y filas de transacción en `TransactionsList`  |
| `prefers-reduced-motion`                | Animaciones CSS (`animate-spin`, transiciones)                   |

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

### ⬜ Deploy

**Dominio:** `billeteclaro.com` — comprado en Cloudflare ($10.44/yr). DNS gestionado desde Cloudflare (CDN + SSL + DDoS gratis).

| Paso | Estado | Descripción |
| ---- | ------ | ----------- |
| 1 | ⬜ | `npm run build` sin errores |
| 2 | ⬜ | Crear proyecto en [vercel.com](https://vercel.com) → Import Git Repository → conectar repo |
| 3 | ⬜ | En Vercel: Settings → Environment Variables → agregar todas las vars de `.env.local` |
| 4 | ⬜ | En Vercel: Settings → Domains → agregar `billeteclaro.com` y `www.billeteclaro.com` → Vercel muestra los registros DNS a agregar |
| 5 | ⬜ | En Cloudflare: DNS → agregar los registros que dio Vercel (tipo `A` o `CNAME`). **Desactivar el proxy naranja (nube)** en el registro que apunta a Vercel — dejarlo solo como DNS |
| 6 | ⬜ | Esperar propagación DNS (5-30 min). Verificar en Vercel que el dominio aparece con ✓ |
| 7 | ⬜ | Google Cloud Console → APIs → Credenciales → OAuth 2.0 → agregar URIs autorizadas: `https://billeteclaro.com/api/auth/callback` y `https://billeteclaro.com/api/auth/gmail-callback` |
| 8 | ⬜ | Supabase Dashboard → Authentication → URL Configuration → agregar `https://billeteclaro.com` en Site URL y Redirect URLs |
| 9 | ⬜ | Probar login con Google en prod |
| 10 | ⬜ | Probar sync de emails end-to-end en prod |

**Notas:**
- Vercel plan Hobby es gratis e incluye dominio custom y SSL automático
- El SSL de Cloudflare no se necesita activar — Vercel lo gestiona. Cloudflare actúa solo como DNS
- Si en algún paso Vercel da error de SSL, verificar que el proxy de Cloudflare (nube naranja) esté desactivado en el registro DNS
