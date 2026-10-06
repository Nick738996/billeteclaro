-- Migración: la app recuerda la categoría que el usuario eligió por comercio.
-- Si cambias "Combo Padel Club" a Deportes una vez, los siguientes correos de
-- ese comercio llegan ya como Deportes. `clave` es el comercio normalizado
-- ('com:combo padel club') o, para transferencias, la cuenta/llave destino
-- ('cta:3105069404'), así el arriendo a la misma cuenta siempre cae en Hogar.
-- Ver lib/services/commerceRules.ts.
CREATE TABLE commerce_rules (
  user_id    uuid REFERENCES auth.users NOT NULL,
  clave      text NOT NULL,
  categoria  text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clave)
);

ALTER TABLE commerce_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_commerce_rules" ON commerce_rules
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
