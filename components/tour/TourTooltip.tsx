'use client'

import { useEffect, useState, useCallback } from 'react'
import { TOUR_STEPS, type TourStep } from '@/lib/tour/tourSteps'

interface Props {
  step: TourStep
  stepIndex: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  onComplete: () => void
}

const TOOLTIP_W = 300
const GAP = 12
const EDGE = 8

export default function TourTooltip({ step, stepIndex, onNext, onPrev, onSkip, onComplete }: Props) {
  const totalSteps = TOUR_STEPS.length
  const isLast = stepIndex === totalSteps - 1

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })

  const computeTooltipPos = useCallback((rect: DOMRect, posicion: TourStep['posicion']) => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const H_EST = 220

    let top = 0, left = 0
    switch (posicion) {
      case 'bottom':
        top = rect.bottom + GAP
        left = rect.left + rect.width / 2 - TOOLTIP_W / 2
        break
      case 'top':
        top = rect.top - H_EST - GAP
        left = rect.left + rect.width / 2 - TOOLTIP_W / 2
        break
      case 'right':
        top = rect.top + rect.height / 2 - H_EST / 2
        left = rect.right + GAP
        break
      case 'left':
        top = rect.top + rect.height / 2 - H_EST / 2
        left = rect.left - TOOLTIP_W - GAP
        break
    }
    left = Math.max(EDGE, Math.min(left, vw - TOOLTIP_W - EDGE))
    top  = Math.max(EDGE, Math.min(top,  vh - H_EST - EDGE))
    setTooltipPos({ top, left })
  }, [])

  useEffect(() => {
    setTargetRect(null)
    const el = document.querySelector(`[data-testid="${step.targetTestId}"]`) as HTMLElement | null
    if (!el) {
      console.warn(`[TourTooltip] elemento no encontrado: data-testid="${step.targetTestId}"`)
      return
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timer = setTimeout(() => {
      const rect = el.getBoundingClientRect()
      setTargetRect(rect)
      computeTooltipPos(rect, step.posicion)
    }, 500)

    return () => clearTimeout(timer)
  }, [step, computeTooltipPos])

  useEffect(() => {
    if (!targetRect) return
    const onResize = () => {
      const el = document.querySelector(`[data-testid="${step.targetTestId}"]`) as HTMLElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      setTargetRect(rect)
      computeTooltipPos(rect, step.posicion)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [targetRect, step, computeTooltipPos])

  if (!targetRect) return null

  return (
    <>
      {/* Spotlight cutout */}
      <div
        style={{
          position: 'fixed',
          top:    targetRect.top    - 8,
          left:   targetRect.left   - 8,
          width:  targetRect.width  + 16,
          height: targetRect.height + 16,
          borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
          zIndex: 999,
          pointerEvents: 'none',
        }}
      />

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-modal="false"
        aria-label={`Tour paso ${stepIndex + 1} de ${totalSteps}: ${step.titulo}`}
        style={{
          position: 'fixed',
          top:    tooltipPos.top,
          left:   tooltipPos.left,
          width:  TOOLTIP_W,
          background: 'var(--surface)',
          border:  '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 18px 18px',
          zIndex: 1000,
          boxSizing: 'border-box',
          boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        }}
      >
        {/* Header: contador + cerrar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 500, letterSpacing: '0.07em' }}>
            {stepIndex + 1} / {totalSteps}
          </span>
          <button
            onClick={onSkip}
            aria-label="Saltar tour"
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: '50%', width: 22, height: 22,
              cursor: 'pointer', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, lineHeight: 1, padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Título */}
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: '0 0 7px' }}>
          {step.titulo}
        </p>

        {/* Descripción */}
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
          {step.descripcion}
        </p>

        {/* Progress — pills */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center', marginBottom: 14 }}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                width: i === stepIndex ? 18 : 4,
                borderRadius: 99,
                background: i === stepIndex ? 'var(--blue)' : 'var(--border)',
                transition: 'width 0.25s ease, background 0.25s ease',
              }}
            />
          ))}
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Anterior — círculo ghost (ocupa espacio fijo aunque esté oculto) */}
          <button
            onClick={onPrev}
            aria-label="Paso anterior"
            disabled={stepIndex === 0}
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: stepIndex === 0 ? 'transparent' : 'var(--text-muted)',
              borderColor: stepIndex === 0 ? 'transparent' : 'var(--border)',
              cursor: stepIndex === 0 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, transition: 'opacity 0.15s',
              pointerEvents: stepIndex === 0 ? 'none' : 'auto',
            }}
          >
            ←
          </button>

          {/* Siguiente / Entendido */}
          <button
            onClick={isLast ? onComplete : onNext}
            style={{
              flex: 1, height: 36,
              background: 'var(--blue)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              letterSpacing: '0.01em',
            }}
          >
            {isLast ? 'Entendido ✓' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </>
  )
}
