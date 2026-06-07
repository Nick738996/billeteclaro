-- Migración: simplificar bancos a solo Rappi (RappiCard + RappiPay)
-- Fecha: 2026-06-07

-- 1. Mover transacciones de bancos eliminados a 'OTRO'
UPDATE transactions
SET banco = 'OTRO'
WHERE banco IN ('BANCOLOMBIA', 'NU', 'NEQUI', 'DAVIPLATA', 'BBVA', 'DAVIVIENDA');

-- 2. Reemplazar el CHECK constraint de banco
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS banco_check;

ALTER TABLE transactions ADD CONSTRAINT banco_check
  CHECK (banco IN ('RAPPICARD', 'RAPPIPAY', 'OTRO'));
