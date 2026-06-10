-- 004_mes_contable.sql
-- Agrega mes_contable para separar ciclos de sueldo del mes calendario.
-- Formato: 'yyyy-MM' (ej. '2026-06').
-- Null en transacciones antiguas hasta que corra el sync o backfill.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS mes_contable text,
  ADD COLUMN IF NOT EXISTS es_sueldo    boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_user_mes_contable
  ON transactions(user_id, mes_contable);
