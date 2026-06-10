import type { SupabaseClient } from '@supabase/supabase-js'

export async function getOnboardingCompleted(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_settings')
    .select('onboarding_completed')
    .eq('user_id', userId)
    .single()
  return data?.onboarding_completed ?? false
}

export async function completeOnboarding(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from('user_settings').upsert({
    user_id: userId,
    onboarding_completed: true,
    onboarding_completed_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}
