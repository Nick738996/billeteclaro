-- Dirección única de reenvío por usuario — reemplaza la ingesta por OAuth
-- (gmail.readonly/Mail.Read) con reenvío que el propio usuario configura en
-- su cliente de correo. `confirmed_at` es el gate de activación: mientras
-- sea NULL, cualquier correo que llegue a esa dirección se ignora (ver
-- lib/services/forwardingService.ts).
CREATE TABLE forwarding_addresses (
  user_id            uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  token              text UNIQUE NOT NULL,
  confirmed_at       timestamptz,
  -- Link de confirmación de Gmail/Outlook extraído del correo de verificación,
  -- guardado como respaldo por si el intento automático de confirmarlo no
  -- funciona — permite ofrecer un botón "Confirmar manualmente" en el wizard.
  pending_confirm_url text,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE forwarding_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_forwarding_address" ON forwarding_addresses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
