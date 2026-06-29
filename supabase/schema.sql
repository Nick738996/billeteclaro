-- BilleteClaro — Schema completo
-- Ejecutar en el SQL Editor de Supabase

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────
-- Tabla: user_tokens (Gmail + Outlook OAuth)
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id                uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  gmail_access_token     text,
  gmail_refresh_token    text,
  outlook_refresh_token  text,
  token_expires_at       timestamptz,
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_tokens" ON user_tokens
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────
-- Tabla: transactions
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  gmail_message_id    text NOT NULL,
  fecha               timestamptz NOT NULL,
  monto               numeric(12,2) NOT NULL,
  comercio            text,
  descripcion         text,
  banco               text NOT NULL DEFAULT 'OTRO',
  tipo                text NOT NULL DEFAULT 'COMPRA',
  categoria           text NOT NULL DEFAULT 'OTRO',
  subcategoria        text,
  id_auditoria        text,
  moneda              text NOT NULL DEFAULT 'COP',
  monto_usd           numeric(12,2),
  flags               text[] DEFAULT '{}',
  raw_snippet         text,
  procesado           boolean DEFAULT true,
  mes_contable        text,
  es_sueldo           boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),

  UNIQUE(user_id, gmail_message_id),

  CONSTRAINT tipo_check CHECK (tipo IN (
    'COMPRA','TRANSFERENCIA_ENVIADA','TRANSFERENCIA_RECIBIDA',
    'PAGO_SERVICIO','RETIRO','ABONO_DEUDA','INGRESO'
  )),
  CONSTRAINT banco_check CHECK (banco IN (
    'RAPPICARD','RAPPIPAY','BANCOLOMBIA',
    'DAVIVIENDA','BBVA','SCOTIABANK_COLPATRIA','BANCO_DE_BOGOTA',
    'NU','NEQUI','LULO_BANK','ITAU','FALABELLA','OTRO'
  )),
  CONSTRAINT categoria_check CHECK (categoria IN (
    'HOGAR','TRANSPORTE','SALIDAS','SALUD','SUSCRIPCIONES',
    'COMPRAS_ONLINE','INVERSION','AHORROS','PRESTAMO','DEUDA','DONACIONES','EDUCACION',
    'REEMBOLSABLE','TRANSFERENCIA','INGRESO','OTRO'
  ))
);

CREATE INDEX idx_transactions_user_fecha ON transactions(user_id, fecha DESC);
CREATE INDEX idx_transactions_user_mes_contable ON transactions(user_id, mes_contable);
CREATE INDEX idx_transactions_user_categoria ON transactions(user_id, categoria);
CREATE INDEX idx_transactions_gmail_id ON transactions(gmail_message_id);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_transactions" ON transactions
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────
-- Tabla: budgets
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mes                   text NOT NULL,
  categoria             text NOT NULL,
  monto_presupuestado   numeric(12,2) NOT NULL,
  created_at            timestamptz DEFAULT now(),

  UNIQUE(user_id, mes, categoria)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_budgets" ON budgets
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────
-- Tabla: patrimonio
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS patrimonio (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  nombre          text NOT NULL,
  institucion     text,
  tipo            text NOT NULL DEFAULT 'LIQUIDO',
  monto           numeric(12,2) NOT NULL,
  moneda          text NOT NULL DEFAULT 'COP',
  rendimiento_ea  numeric(5,2),
  vence_en        date,
  notas           text,
  created_at      timestamptz DEFAULT now(),

  CONSTRAINT tipo_check CHECK (tipo IN ('LIQUIDO','BLOQUEADO','CUSTODIA'))
);

ALTER TABLE patrimonio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_patrimonio" ON patrimonio
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────
-- Tabla: sync_log
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  started_at            timestamptz DEFAULT now(),
  finished_at           timestamptz,
  correos_revisados     integer DEFAULT 0,
  transacciones_nuevas  integer DEFAULT 0,
  errores               text[] DEFAULT '{}',
  status                text NOT NULL DEFAULT 'RUNNING',

  CONSTRAINT status_check CHECK (status IN ('RUNNING','DONE','ERROR'))
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sync_log" ON sync_log
  FOR ALL USING (auth.uid() = user_id);
