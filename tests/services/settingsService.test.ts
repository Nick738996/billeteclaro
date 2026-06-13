import { describe, it, expect } from 'vitest'
import { completeOnboarding, getOnboardingCompleted } from '@/lib/services/settingsService'
import type { SupabaseClient } from '@supabase/supabase-js'

function makeUpsertSupabase(error: { message: string } | null): SupabaseClient {
  return {
    from: () => ({
      upsert: () => Promise.resolve({ error, data: null }),
    }),
  } as unknown as SupabaseClient
}

function makeSelectSupabase(data: { onboarding_completed: boolean } | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('completeOnboarding', () => {
  describe('Bug 4 — el onboarding no debe repetirse si el upsert falla', () => {
    it('resuelve sin error cuando Supabase tiene éxito', async () => {
      const supabase = makeUpsertSupabase(null)
      await expect(completeOnboarding(supabase, 'user-1')).resolves.toBeUndefined()
    })

    it('lanza error cuando el upsert de Supabase falla', async () => {
      const supabase = makeUpsertSupabase({ message: 'violates row-level security policy' })
      await expect(completeOnboarding(supabase, 'user-1')).rejects.toThrow('completeOnboarding')
    })

    it('el mensaje del error incluye el mensaje de Supabase', async () => {
      const supabase = makeUpsertSupabase({ message: 'connection timeout' })
      await expect(completeOnboarding(supabase, 'user-1')).rejects.toThrow('connection timeout')
    })
  })
})

describe('getOnboardingCompleted', () => {
  it('devuelve true si onboarding_completed es true en la base de datos', async () => {
    const supabase = makeSelectSupabase({ onboarding_completed: true })
    const result = await getOnboardingCompleted(supabase, 'user-1')
    expect(result).toBe(true)
  })

  it('devuelve false si onboarding_completed es false', async () => {
    const supabase = makeSelectSupabase({ onboarding_completed: false })
    const result = await getOnboardingCompleted(supabase, 'user-1')
    expect(result).toBe(false)
  })

  it('devuelve false si no hay fila en user_settings (usuario nuevo)', async () => {
    const supabase = makeSelectSupabase(null)
    const result = await getOnboardingCompleted(supabase, 'user-1')
    expect(result).toBe(false)
  })
})
