-- Tabla de presupuestos mensuales por categoría
CREATE TABLE IF NOT EXISTS budgets (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes         text NOT NULL,  -- formato YYYY-MM
  categoria   text NOT NULL,
  monto       numeric(12, 2) NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  CONSTRAINT budgets_unique UNIQUE (user_id, mes, categoria),
  CONSTRAINT budgets_monto_positive CHECK (monto >= 0),
  CONSTRAINT budgets_categoria CHECK (categoria IN (
    'HOGAR','TRANSPORTE','SALIDAS','SALUD','SUSCRIPCIONES',
    'COMPRAS_ONLINE','INVERSION','DONACIONES','EDUCACION',
    'REEMBOLSABLE','OTRO'
  ))
);

-- RLS
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own budgets"
  ON budgets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
