'use client'

import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'

export type SyncErrorType =
  | 'not_connected'
  | 'auth_expired'
  | 'auth_permission_denied'
  | 'no_emails_found'
  | 'sync_timeout'
  | 'unknown'

interface ErrorInfo {
  titulo: string
  descripcion: string
  accion?: { label: string; href?: string; onClick?: () => void }
}

const ERROR_MESSAGES: Record<SyncErrorType, ErrorInfo> = {
  not_connected: {
    titulo: 'Tu correo no está conectado',
    descripcion: 'Conecta tu Gmail u Outlook para que podamos leer las notificaciones de tus bancos.',
    accion: { label: 'Conectar correo', href: '/' },
  },
  auth_expired: {
    titulo: 'La conexión con tu correo expiró',
    descripcion: 'El acceso a tu correo se venció. Vuelve a conectarlo para sincronizar.',
    accion: { label: 'Reconectar correo', href: '/' },
  },
  auth_permission_denied: {
    titulo: 'Sin permiso de lectura',
    descripcion: 'BilleteClaro necesita permiso para leer tus correos de banco. Vuelve a conectar tu correo y acepta el permiso.',
    accion: { label: 'Reconectar correo', href: '/' },
  },
  no_emails_found: {
    titulo: 'No encontramos correos de banco',
    descripcion: 'No detectamos notificaciones de transacciones en tu correo. Verifica que tengas las alertas de movimientos activadas en tu banco.',
  },
  sync_timeout: {
    titulo: 'La sincronización tardó demasiado',
    descripcion: 'El servidor tardó más de lo esperado. Intenta de nuevo en un momento.',
  },
  unknown: {
    titulo: 'Algo salió mal',
    descripcion: 'Hubo un error al sincronizar. Intenta de nuevo.',
  },
}

interface Props {
  type: SyncErrorType
  onRetry?: () => void
  /** Sobreescribe el href de la acción (p.ej. `/api/auth/gmail-connect?next=...` según el proveedor del usuario) */
  reconnectHref?: string
}

export default function SyncErrorCard({ type, onRetry, reconnectHref }: Props) {
  const info = ERROR_MESSAGES[type]
  const accion = info.accion && reconnectHref ? { ...info.accion, href: reconnectHref } : info.accion

  return (
    <div
      style={{
        background: 'var(--red-soft)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--red)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 18px',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', marginBottom: 4 }}>
            {info.titulo}
          </p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {info.descripcion}
          </p>
          {(accion || onRetry) && (
            <div className="flex gap-3 mt-3">
              {accion && (
                accion.href ? (
                  <a
                    href={accion.href}
                    className="flex items-center gap-1 font-medium transition-opacity hover:opacity-80"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--red)' }}
                  >
                    <ExternalLink size={12} />
                    {accion.label}
                  </a>
                ) : (
                  <button
                    onClick={accion.onClick}
                    className="flex items-center gap-1 font-medium transition-opacity hover:opacity-80"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {accion.label}
                  </button>
                )
              )}
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1 font-medium transition-opacity hover:opacity-80"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <RefreshCw size={12} />
                  Reintentar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
