'use client'

import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'

export type SyncErrorType =
  | 'gmail_auth_expired'
  | 'gmail_permission_denied'
  | 'no_emails_found'
  | 'sync_timeout'
  | 'unknown'

interface ErrorInfo {
  titulo: string
  descripcion: string
  accion?: { label: string; href?: string; onClick?: () => void }
}

const ERROR_MESSAGES: Record<SyncErrorType, ErrorInfo> = {
  gmail_auth_expired: {
    titulo: 'La sesión de Gmail expiró',
    descripcion: 'Tu acceso a Gmail se venció. Vuelve a conectar tu cuenta para sincronizar.',
    accion: { label: 'Reconectar Gmail', href: '/api/auth/gmail-connect' },
  },
  gmail_permission_denied: {
    titulo: 'Sin permiso de Gmail',
    descripcion: 'BilleteClaro necesita permiso para leer tus correos de banco.',
    accion: { label: 'Dar permiso', href: '/api/auth/gmail-connect' },
  },
  no_emails_found: {
    titulo: 'No encontramos correos de banco',
    descripcion: 'Revisamos tu Gmail y no hay notificaciones de RappiCard, RappiPay ni Bancolombia. Verifica que tengas las notificaciones de transacciones activadas en tu banco.',
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
}

export default function SyncErrorCard({ type, onRetry }: Props) {
  const info = ERROR_MESSAGES[type]

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
          {(info.accion || onRetry) && (
            <div className="flex gap-3 mt-3">
              {info.accion && (
                info.accion.href ? (
                  <a
                    href={info.accion.href}
                    className="flex items-center gap-1 font-medium transition-opacity hover:opacity-80"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--red)' }}
                  >
                    <ExternalLink size={12} />
                    {info.accion.label}
                  </a>
                ) : (
                  <button
                    onClick={info.accion.onClick}
                    className="flex items-center gap-1 font-medium transition-opacity hover:opacity-80"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {info.accion.label}
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
