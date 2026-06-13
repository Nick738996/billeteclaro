import type { SupabaseClient } from '@supabase/supabase-js'

export async function getTourCompleted(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_settings')
    .select('tour_completed')
    .eq('user_id', userId)
    .single()
  return data?.tour_completed ?? false
}

export async function completeTourInDB(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    tour_completed: true,
    tour_completed_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw new Error(`completeTour: ${error.message}`)
}

export async function getOnboardingCompleted(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_settings')
    .select('onboarding_completed')
    .eq('user_id', userId)
    .single()
  return data?.onboarding_completed ?? false
}

export async function completeOnboarding(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    onboarding_completed: true,
    onboarding_completed_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw new Error(`completeOnboarding: ${error.message}`)
}
