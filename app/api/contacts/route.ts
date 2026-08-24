import { ok, err } from '@/lib/api/response'
import { withAuth } from '@/lib/api/withAuth'
import { getContactAliases, upsertContactAlias } from '@/lib/services/contactAliasService'

// GET /api/contacts — lista los alias de contraparte del usuario
export const GET = withAuth(async (req, user, supabase) => {
  try {
    return ok(await getContactAliases(supabase, user.id))
  } catch (e) {
    console.error('[GET /api/contacts]', { userId: user.id }, e)
    return err('Error cargando contactos')
  }
})

// POST /api/contacts  body: { identificador, nombre }
export const POST = withAuth(async (req, user, supabase) => {
  const body = await req.json() as { identificador?: string; nombre?: string }
  if (!body.identificador?.trim() || !body.nombre?.trim()) {
    return err('identificador y nombre son requeridos', 400)
  }

  try {
    const alias = await upsertContactAlias(supabase, user.id, body.identificador, body.nombre)
    return ok(alias)
  } catch (e) {
    console.error('[POST /api/contacts]', { userId: user.id }, e)
    return err('Error guardando el contacto')
  }
})
