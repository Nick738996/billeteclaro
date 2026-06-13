export type Banco =
  | 'RAPPICARD'
  | 'RAPPIPAY'
  | 'BANCOLOMBIA'
  | 'OTRO'

export type TipoTransaccion =
  | 'COMPRA'
  | 'TRANSFERENCIA_ENVIADA'
  | 'TRANSFERENCIA_RECIBIDA'
  | 'PAGO_SERVICIO'
  | 'RETIRO'
  | 'ABONO_DEUDA'
  | 'INGRESO'

export type Categoria =
  | 'HOGAR'
  | 'TRANSPORTE'
  | 'SALIDAS'
  | 'SALUD'
  | 'SUSCRIPCIONES'
  | 'COMPRAS_ONLINE'
  | 'INVERSION'
  | 'AHORROS'
  | 'PRESTAMO'
  | 'DEUDA'
  | 'DONACIONES'
  | 'EDUCACION'
  | 'REEMBOLSABLE'
  | 'TRANSFERENCIA'
  | 'INGRESO'
  | 'OTRO'

export interface Transaction {
  id: string
  user_id: string
  gmail_message_id: string
  fecha: string
  monto: number
  comercio: string | null
  descripcion: string | null
  banco: Banco
  tipo: TipoTransaccion
  categoria: Categoria
  subcategoria: string | null
  id_auditoria: string | null
  moneda: string
  monto_usd: number | null
  flags: string[]
  raw_snippet: string | null
  procesado: boolean
  mes_contable: string | null
  es_sueldo: boolean
  created_at: string
}

export interface Budget {
  id: string
  user_id: string
  mes: string
  categoria: Categoria
  monto_presupuestado: number
  created_at: string
}

export interface SyncLog {
  id: string
  user_id: string
  started_at: string
  finished_at: string | null
  correos_revisados: number
  transacciones_nuevas: number
  errores: string[]
  skipped_ids?: string[]
  status: 'RUNNING' | 'DONE' | 'ERROR'
}

export interface BudgetSubcat {
  nombre: string
  monto: number
}

export interface BudgetEntry {
  monto: number
  subcategorias: BudgetSubcat[]
}

/** Categorías disponibles para presupuesto mensual (excluye TRANSFERENCIA, INGRESO, PRESTAMO) */
export const PRESUPUESTO_CATS: Categoria[] = [
  'HOGAR', 'TRANSPORTE', 'SALIDAS', 'SALUD', 'SUSCRIPCIONES',
  'COMPRAS_ONLINE', 'INVERSION', 'AHORROS', 'DEUDA', 'DONACIONES', 'EDUCACION', 'REEMBOLSABLE', 'OTRO',
]

export interface ExtractedTransaction {
  fecha: string | null
  monto: number
  comercio: string | null
  descripcion: string | null
  banco: Banco
  tipo: TipoTransaccion
  categoria: Categoria
  subcategoria: string | null
  moneda: string
  monto_usd: number | null
  flags: string[]
}

export interface MonthlyStats {
  gastos: number
  gastosReales: number
  ingresos: number
  balance: number
  transacciones: number
  porCategoria: Record<Categoria, number>
}

export const CATEGORIA_LABELS: Record<Categoria, string> = {
  HOGAR: 'Hogar',
  TRANSPORTE: 'Transporte',
  SALIDAS: 'Salidas',
  SALUD: 'Salud',
  SUSCRIPCIONES: 'Suscripciones',
  COMPRAS_ONLINE: 'Compras Online',
  INVERSION: 'Inversión',
  AHORROS: 'Ahorros',
  PRESTAMO: 'Préstamo',
  DEUDA: 'Deuda',
  DONACIONES: 'Donaciones',
  EDUCACION: 'Educación',
  REEMBOLSABLE: 'Reembolsable',
  TRANSFERENCIA: 'Transferencia',
  INGRESO: 'Ingreso',
  OTRO: 'Otro',
}

export const CATEGORIA_COLORS: Record<Categoria, string> = {
  HOGAR: '#6366f1',       // indigo   — hogar/servicios
  TRANSPORTE: '#f59e0b',  // amber    — movilidad
  SALIDAS: '#f43f5e',     // rose     — restaurantes/ocio
  SALUD: '#10b981',       // emerald  — salud
  SUSCRIPCIONES: '#d946ef', // fuchsia — Netflix/Spotify
  COMPRAS_ONLINE: '#0ea5e9', // sky   — compras digitales
  INVERSION: '#14b8a6',   // teal     — inversión
  AHORROS: '#06b6d4',     // cyan     — ahorros
  PRESTAMO: '#a78bfa',    // violet   — préstamos
  DEUDA: '#ef4444',       // red      — deudas/créditos
  DONACIONES: '#f97316',  // orange   — donaciones
  EDUCACION: '#84cc16',   // lime     — educación
  REEMBOLSABLE: '#38bdf8', // light-blue — reembolsable
  TRANSFERENCIA: '#a855f7', // purple  — transferencias
  INGRESO: '#22c55e',     // green    — ingresos
  OTRO: '#94a3b8',        // slate    — sin categoría
}

export const BANCO_LABELS: Record<Banco, string> = {
  RAPPICARD:   'RappiCard',
  RAPPIPAY:    'RappiPay',
  BANCOLOMBIA: 'Bancolombia',
  OTRO:        'Otro',
}

export function formatCOP(amount: number): string {
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
  return `$${formatted}`
}

export function formatCOPCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    return `${sign}$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (abs >= 1_000) {
    const k = abs / 1_000
    return `${sign}$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
  }
  return `${sign}${formatCOP(abs)}`
}

export type InsightTipo = 'alerta' | 'consejo' | 'positivo' | 'proyeccion' | 'observacion'

export interface Insight {
  tipo: InsightTipo
  texto: string
  categoria?: Categoria
  limite_sugerido?: number
}

export interface AdvisorContext {
  mes: string
  dias_transcurridos: number
  dias_restantes: number
  dias_restantes_semana: number
  gastos_por_categoria: Record<Categoria, number>
  presupuesto_por_categoria: Record<Categoria, number>
  total_gastado: number
  total_presupuestado: number
  ingreso_estimado: number
  gasto_diario_promedio: number
  proyeccion_cierre: number
}

export interface AiInsight {
  id: string
  user_id: string
  mes: string
  insights: Insight[]
  generated_at: string
  context_hash: string
}

export interface ChatMessage {
  id: string
  user_id: string
  mes: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export function isIngreso(tipo: TipoTransaccion): boolean {
  return tipo === 'INGRESO' || tipo === 'TRANSFERENCIA_RECIBIDA'
}

// ABONO_DEUDA = pago de tarjeta desde tu propia cuenta → no es gasto ni ingreso
// AHORROS / PRESTAMO = movimientos propios que no son gastos del mes
export function isGasto(tipo: TipoTransaccion, categoria?: Categoria): boolean {
  if (categoria === 'AHORROS' || categoria === 'PRESTAMO') return false
  return !isIngreso(tipo) && tipo !== 'ABONO_DEUDA'
}
