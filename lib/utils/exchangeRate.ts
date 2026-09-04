// Conversión a COP para transacciones en otras monedas (bancos extranjeros
// reenviados por el usuario) — el resto de la app (presupuestos, stats del
// dashboard, el asesor) suma `monto` asumiendo que siempre está en COP, así
// que convertir acá en un solo lugar evita tener que tocar cada consumidor.
//
// Usa la tasa del DÍA REAL de la transacción (no la de hoy) para que la
// conversión sea estable — no cambia si se reprocesa la misma transacción
// más adelante. Fuente: fawazahmed0/currency-api (gratis, sin API key,
// snapshots diarios desde 2026 en adelante, incluye COP).
const BASE_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api'

// Los snapshots históricos son inmutables — se cachean indefinidamente. El
// de "latest" sí cambia durante el día, ese se refresca cada 6 horas.
const LATEST_TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<string, { rates: Record<string, number>; fetchedAt: number }>()

async function getRates(base: string, dateKey: string): Promise<Record<string, number> | null> {
  const cacheKey = `${dateKey}:${base}`
  const cached = cache.get(cacheKey)
  if (cached && (dateKey !== 'latest' || Date.now() - cached.fetchedAt < LATEST_TTL_MS)) {
    return cached.rates
  }

  try {
    const res = await fetch(`${BASE_URL}@${dateKey}/v1/currencies/${base.toLowerCase()}.json`)
    if (!res.ok) {
      // Fecha sin snapshot (futura, o antes del inicio de la serie) — usar la más reciente disponible.
      if (dateKey !== 'latest') return getRates(base, 'latest')
      return null
    }
    const data = await res.json()
    const rates = data[base.toLowerCase()]
    if (!rates) return null
    cache.set(cacheKey, { rates, fetchedAt: Date.now() })
    return rates
  } catch (err) {
    console.error('[exchangeRate] no se pudo obtener la tasa de cambio:', err)
    return null
  }
}

/** 'YYYY-MM-DD' a partir de un ISO string, o 'latest' si no es una fecha válida. */
function toDateKey(fecha?: string): string {
  if (!fecha) return 'latest'
  const d = new Date(fecha)
  return isNaN(d.getTime()) ? 'latest' : d.toISOString().slice(0, 10)
}

/** Convierte `monto` (en `moneda`) a COP usando la tasa del día de `fecha`. Redondea a entero. */
export async function convertToCOP(monto: number, moneda: string, fecha?: string): Promise<number | null> {
  if (moneda === 'COP') return monto
  const rates = await getRates(moneda, toDateKey(fecha))
  const rate = rates?.['cop']
  return rate ? Math.round(monto * rate) : null
}

/** Convierte `monto` (en `moneda`) a USD usando la tasa del día de `fecha`, con 2 decimales. */
export async function convertToUSD(monto: number, moneda: string, fecha?: string): Promise<number | null> {
  if (moneda === 'USD') return monto
  const rates = await getRates(moneda, toDateKey(fecha))
  const rate = rates?.['usd']
  return rate ? Math.round(monto * rate * 100) / 100 : null
}
