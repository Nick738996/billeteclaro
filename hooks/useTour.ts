'use client'

import { useState, useCallback } from 'react'
import { TOUR_STEPS } from '@/lib/tour/tourSteps'

export interface TourControls {
  isActive: boolean
  currentStep: number
  startTour: () => void
  nextStep: () => void
  prevStep: () => void
  completeTour: () => Promise<void>
  skipTour: () => void
}

export function useTour(): TourControls {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const startTour = useCallback(() => {
    setCurrentStep(0)
    setIsActive(true)
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStep(prev => Math.min(prev + 1, TOUR_STEPS.length - 1))
  }, [])

  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }, [])

  const markCompleted = useCallback(async () => {
    try {
      await fetch('/api/settings/tour', { method: 'POST' })
    } catch {
      // best-effort — tour UI should still close even if DB write fails
    }
  }, [])

  const completeTour = useCallback(async () => {
    setIsActive(false)
    await markCompleted()
  }, [markCompleted])

  const skipTour = useCallback(() => {
    setIsActive(false)
    markCompleted()
  }, [markCompleted])

  return { isActive, currentStep, startTour, nextStep, prevStep, completeTour, skipTour }
}
