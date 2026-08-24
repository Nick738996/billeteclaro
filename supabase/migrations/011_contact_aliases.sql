-- Migración: alias de contraparte para llaves/cuentas de transferencia
-- Muchos correos de transferencia (Bancolombia, RappiPay) sólo traen un
-- número de cuenta enmascarado o una llave (teléfono/handle) del destinatario,
-- nunca un nombre. Esta tabla permite que el usuario asigne un nombre una vez
-- por identificador y que se aplique a todas sus transacciones (pasadas y
-- futuras) con ese mismo identificador.

ALTER TABLE transactions ADD COLUMN contraparte_id text;

CREATE TABLE contact_aliases (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users NOT NULL,
  identificador text NOT NULL,
  nombre        text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, identificador)
);

ALTER TABLE contact_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_contact_aliases" ON contact_aliases
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
