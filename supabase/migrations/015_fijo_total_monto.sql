-- Migración: simplifica Gastos Fijos a un solo monto total declarado, en vez
-- de sumar presupuestos por categoría (BudgetManager tenía 8+ filas
-- expandibles, una por categoría fija — mucha fricción para configurar algo
-- que ya se resuelve solo). La clasificación de qué transacciones cuentan
-- como Fijo sigue viviendo en category_capas / transactions.capa_override
-- (tocar la etiqueta de capa en la lista de transacciones) — este monto es
-- solo la meta total contra la que se compara el gasto real, no un desglose.
ALTER TABLE monthly_plan ADD COLUMN fijo_total_monto numeric(12,2) NOT NULL DEFAULT 0;
