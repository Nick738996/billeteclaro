-- Migración: tabla de cuentas de ahorro manuales
-- Fecha: 2026-06-16

CREATE TABLE savings_accounts (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users NOT NULL,
  nombre      text NOT NULL,
  saldo       numeric(14,2) NOT NULL DEFAULT 0,
  color       text NOT NULL DEFAULT '#4ADE80',
  orden       int NOT NULL DEFAULT 0,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE savings_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_savings" ON savings_accounts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_savings_user ON savings_accounts(user_id, orden);
