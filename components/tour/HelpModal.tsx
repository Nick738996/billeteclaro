'use client'

import { X } from 'lucide-react'

interface Props {
  onClose: () => void
  onStartTour: () => void
}

const SECTIONS = [
  {
    titulo: 'Balance y progreso',
    desc: 'Tu gasto del mes comparado con tus ingresos totales. El porcentaje sube a medida que gastas.',
  },
  {
    titulo: 'Presupuesto',
    desc: 'Configura límites por categoría. Las barras te avisan en amarillo (80%) y rojo (100%) cuando te acercás al límite.',
  },
  {
    titulo: 'Asesor financiero',
    desc: 'Análisis automático de tus patrones de gasto y chat con IA para hacerle preguntas sobre tu plata.',
  },
  {
    titulo: 'Transacciones',
    desc: 'Detectadas automáticamente desde tu correo. Podés buscar, filtrar por categoría o agregar una manualmente.',
  },
]

export default function HelpModal({ onClose, onStartTour }: Props) {
  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      {/* Sheet / Modal */}
      <div
        className="w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          padding: 24,
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>
            Cómo funciona BilleteClaro
          </p>
          <button
            onClick={onClose}
            aria-label="Cerrar ayuda"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {SECTIONS.map(s => (
            <div key={s.titulo}>
              <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>
                {s.titulo}
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onClose(); onStartTour() }}
            style={{
              flex: 1,
              background: 'var(--blue)', color: '#fff',
              border: 'none', padding: '12px 16px',
              borderRadius: 'var(--radius-md)', fontSize: 14,
              fontWeight: 500, cursor: 'pointer',
            }}
          >
            Relanzar tour completo
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'none', color: 'var(--text-muted)',
              fontSize: 14, cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
