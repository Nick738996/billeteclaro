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
  HOGAR: '#6366f1',
  TRANSPORTE: '#f59e0b',
  SALIDAS: '#ec4899',
  SALUD: '#10b981',
  SUSCRIPCIONES: '#8b5cf6',
  COMPRAS_ONLINE: '#3b82f6',
  INVERSION: '#14b8a6',
  DONACIONES: '#f97316',
  EDUCACION: '#84cc16',
  REEMBOLSABLE: '#06b6d4',
  TRANSFERENCIA: '#a855f7',
  INGRESO: '#22c55e',
  OTRO: '#94a3b8',
}

export const BANCO_LABELS: Record<Banco, string> = {
  RAPPICARD: 'RappiCard',
  RAPPIPAY: 'RappiPay',
  OTRO: 'Otro',
}

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function isIngreso(tipo: TipoTransaccion): boolean {
  return tipo === 'INGRESO' || tipo === 'TRANSFERENCIA_RECIBIDA'
}
