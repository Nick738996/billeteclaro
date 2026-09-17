-- Migración: sistema de 3 capas (Ahorro/Fijo/Variable) + Cupo Semanal Vivo
-- Fecha: 2026-09-17

-- Plan mensual declarado por el usuario (ingreso neto + meta de ahorro).
-- Fuente de verdad para derivar el Pool Variable Mensual — no se ingresa
-- manualmente, se deriva de este plan + los presupuestos de categorías FIJO.
CREATE TABLE monthly_plan (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid REFERENCES auth.users NOT NULL,
  mes                   text NOT NULL,
  ingreso_neto_mensual  numeric(12,2) NOT NULL,
  ahorro_meta_monto     numeric(12,2) NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (user_id, mes)
);

ALTER TABLE monthly_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_monthly_plan" ON monthly_plan
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Override de capa por categoría (para categorías custom, o para que el
-- usuario reclasifique una categoría built-in). Sin fila aquí, la capa por
-- defecto sale de CATEGORIA_CAPA_DEFAULT en lib/types.ts.
CREATE TABLE category_capas (
  user_id   uuid REFERENCES auth.users NOT NULL,
  categoria text NOT NULL,
  capa      text NOT NULL CHECK (capa IN ('AHORRO', 'FIJO', 'VARIABLE')),
  PRIMARY KEY (user_id, categoria)
);

ALTER TABLE category_capas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_category_capas" ON category_capas
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Override puntual por transacción — toggle "Gasto Fijo" del registro rápido,
-- o reclasificar un gasto individual (ej. un mercado dentro de HOGAR como
-- variable). NULL = usa la capa por defecto de la categoría.
ALTER TABLE transactions
  ADD COLUMN capa_override text CHECK (capa_override IN ('AHORRO', 'FIJO', 'VARIABLE'));

-- Ledger semanal del Cupo Semanal Vivo. No es derivable solo de transacciones
-- porque el cierre de semana involucra una decisión del usuario (bonus de
-- ahorro vs. rollover) que hay que persistir igual que cualquier otro estado.
CREATE TABLE weekly_allowances (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users NOT NULL,
  mes               text NOT NULL,
  semana_inicio     date NOT NULL,
  semana_fin        date NOT NULL,
  cupo_base         numeric(12,2) NOT NULL,
  ajuste_carryover  numeric(12,2) NOT NULL DEFAULT 0,
  cerrada           boolean NOT NULL DEFAULT false,
  decision          text CHECK (decision IN ('bonus_ahorro', 'rollover')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (user_id, semana_inicio)
);

ALTER TABLE weekly_allowances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_weekly_allowances" ON weekly_allowances
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_weekly_allowances_user_mes ON weekly_allowances(user_id, mes);
