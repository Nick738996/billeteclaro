-- Migración: permitir categorías personalizadas en transactions
-- El CHECK constraint sólo permitía las categorías predefinidas.
-- Al crear categorías custom (ej. "MASCOTAS") y recategorizar una transacción,
-- el insert fallaba con un 500.
-- Solución: remover el constraint. La validación queda en la capa de aplicación.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS categoria_check;
