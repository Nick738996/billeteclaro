-- Migración: desglose opcional de Fijo y Ahorro en "Tu plan mensual".
-- El total sigue siendo un solo número (fijo_total_monto / ahorro_meta_monto,
-- migración 015) — esto solo guarda, si el usuario elige desglosarlo, los
-- ítems (nombre + monto) que suman ese total. No reintroduce presupuesto por
-- categoría de transacción (eso lo resuelve category_capas /
-- transactions.capa_override): estos ítems son solo una ayuda para llegar al
-- número, sin clasificación ni badges por ítem.
ALTER TABLE monthly_plan ADD COLUMN fijo_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE monthly_plan ADD COLUMN ahorro_items jsonb NOT NULL DEFAULT '[]'::jsonb;
