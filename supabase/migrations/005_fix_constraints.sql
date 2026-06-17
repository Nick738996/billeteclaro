-- Migración: corregir categoria_check y banco_check
-- Fecha: 2026-06-16
--
-- Problemas:
--   1. categoria_check no incluía 'PRESTAMO' → error al categorizar como PRESTAMO
--   2. banco_check no incluía 'BANCOLOMBIA' → insert error silencioso en sync de Bancolombia

-- 1. Agregar PRESTAMO al check de categoría
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS categoria_check;

ALTER TABLE transactions ADD CONSTRAINT categoria_check CHECK (categoria IN (
  'HOGAR','TRANSPORTE','SALIDAS','SALUD','SUSCRIPCIONES',
  'COMPRAS_ONLINE','INVERSION','AHORROS','PRESTAMO','DEUDA','DONACIONES','EDUCACION',
  'REEMBOLSABLE','TRANSFERENCIA','INGRESO','OTRO'
));

-- 2. Re-agregar BANCOLOMBIA al check de banco
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS banco_check;

ALTER TABLE transactions ADD CONSTRAINT banco_check
  CHECK (banco IN ('RAPPICARD', 'RAPPIPAY', 'BANCOLOMBIA', 'OTRO'));
