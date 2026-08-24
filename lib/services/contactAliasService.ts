import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContactAlias, Transaction } from '@/lib/types'

export function normalizeIdentificador(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Fallback legible cuando no hay alias: últimos 4 dígitos si es numérico, o el string tal cual (ej. @handle) */
export function maskIdentificador(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 4 ? `****${digits.slice(-4)}` : raw
}

export async function getContactAliases(supabase: SupabaseClient, userId: string): Promise<ContactAlias[]> {
  const { data, error } = await supabase
    .from('contact_aliases')
    .select('id, identificador, nombre')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as ContactAlias[]
}

export async function upsertContactAlias(
  supabase: SupabaseClient,
  userId: string,
  identificador: string,
  nombre: string
): Promise<ContactAlias> {
  const { data, error } = await supabase
    .from('contact_aliases')
    .upsert(
      { user_id: userId, identificador: normalizeIdentificador(identificador), nombre: nombre.trim() },
      { onConflict: 'user_id,identificador' }
    )
    .select('id, identificador, nombre')
    .single()
  if (error) throw error
  return data as ContactAlias
}

/** Sobreescribe comercio en memoria (nunca se persiste) con el alias del usuario o un fallback enmascarado */
export function applyContraparteDisplay(t: Transaction, aliasMap: Map<string, string>): Transaction {
  if (!t.contraparte_id) return t
  const alias = aliasMap.get(normalizeIdentificador(t.contraparte_id))
  return { ...t, comercio: alias ?? maskIdentificador(t.contraparte_id) }
}
