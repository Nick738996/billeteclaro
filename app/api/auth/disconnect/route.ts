import { google } from 'googleapis'
import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { decryptToken } from '@/lib/utils/tokenCrypto'

// POST /api/auth/disconnect — revoca el acceso a Gmail/Outlook y borra los
// tokens guardados. El usuario debe volver a autorizar desde /onboarding
// para que la sincronización automática funcione de nuevo.
export const POST = withAuth(async (_req, user, supabase) => {
  const { data: tokenRow } = await supabase
    .from('user_tokens')
    .select('gmail_refresh_token, outlook_refresh_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (tokenRow?.gmail_refresh_token) {
    try {
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
      await oauth2.revokeToken(decryptToken(tokenRow.gmail_refresh_token))
    } catch (e) {
      // No bloqueamos la desconexión si Google ya invalidó el token por su cuenta
      // (ej. el usuario ya lo revocó manualmente) — igual borramos nuestra copia abajo.
      console.error('[disconnect] no se pudo revocar el token de Gmail con Google:', e)
    }
  }

  // Microsoft no expone un endpoint público para revocar un refresh_token
  // puntual con los permisos delegados que pide esta app (Mail.Read +
  // offline_access, sin consentimiento de admin) — solo podemos borrar
  // nuestra copia. El usuario puede revocar el acceso completo desde
  // https://myaccount.microsoft.com/ → Privacidad → Aplicaciones conectadas.

  const { error } = await supabase
    .from('user_tokens')
    .update({
      gmail_access_token: null,
      gmail_refresh_token: null,
      outlook_refresh_token: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  if (error) {
    console.error('[disconnect]', { userId: user.id }, error)
    return err('No se pudo desconectar la cuenta de correo')
  }

  return ok({ disconnected: true })
})
