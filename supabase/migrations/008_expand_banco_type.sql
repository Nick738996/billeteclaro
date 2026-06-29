-- Migración 008: Ampliar banco_check para soportar todos los bancos colombianos
-- Permite que transacciones de Davivienda, BBVA, Nu, Nequi, etc.
-- se guarden con su banco real en vez de 'OTRO'.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS banco_check;

ALTER TABLE transactions ADD CONSTRAINT banco_check CHECK (banco IN (
  'RAPPICARD',
  'RAPPIPAY',
  'BANCOLOMBIA',
  'DAVIVIENDA',
  'BBVA',
  'SCOTIABANK_COLPATRIA',
  'BANCO_DE_BOGOTA',
  'NU',
  'NEQUI',
  'LULO_BANK',
  'ITAU',
  'FALABELLA',
  'OTRO'
));
