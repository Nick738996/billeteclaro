-- Migración: línea de imprevistos en el plan mensual.
-- Cada mes aparecía un gasto grande que no se repite (vuelo, bici, hotel) y
-- rompía el presupuesto porque no estaba en ningún lado. Ahora el plan
-- reserva un monto para eso, sugerido con lo que pasa en un mes normal
-- (ver lib/services/planReality.ts). La meta de ahorro queda como resultado:
-- ingreso − fijos − día a día − imprevistos.
ALTER TABLE monthly_plan ADD COLUMN imprevistos_monto numeric(14,2) NOT NULL DEFAULT 0;
