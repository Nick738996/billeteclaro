export type Banco =
  | 'RAPPICARD'
  | 'RAPPIPAY'
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

export interface PatrimonioItem {
  id: string
  user_id: string
  nombre: string
  institucion: string | null
  tipo: 'LIQUIDO' | 'BLOQUEADO' | 'CUSTODIA'
  monto: number
  moneda: string
  rendimiento_ea: number | null
  vence_en: string | null
  notas: string | null
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
  status: 'RUNNING' | 'DONE' | 'ERROR'
}

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
  INVERSION: '#14b8a6',   // teal     — ahorro/inversión
  DONACIONES: '#f97316',  // orange   — donaciones
  EDUCACION: '#84cc16',   // lime     — educación
  REEMBOLSABLE: '#38bdf8', // light-blue — reembolsable
  TRANSFERENCIA: '#a855f7', // purple  — transferencias
  INGRESO: '#22c55e',     // green    — ingresos
  OTRO: '#94a3b8',        // slate    — sin categoría
}

export const BANCO_LABELS: Record<Banco, string> = {
  RAPPICARD: 'RappiCard',
  RAPPIPAY: 'RappiPay',
  OTRO: 'Otro',
}

export function formatCOP(amount: number): string {
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `$${formatted}`
}

export function isIngreso(tipo: TipoTransaccion): boolean {
  return tipo === 'INGRESO' || tipo === 'TRANSFERENCIA_RECIBIDA'
}
