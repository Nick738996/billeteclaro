-- Evita que dos syncs concurrentes del mismo usuario queden en estado RUNNING
-- a la vez. Sin esto, dos POST /api/sync casi simultáneos podían leer el
-- cooldown de lib/services/syncService.ts como "libre" antes de que
-- cualquiera de los dos insertara su fila (TOCTOU race) y ambos procedían en
-- paralelo, gastando cuota de Groq/Gmail/Outlook el doble de rápido.
CREATE UNIQUE INDEX IF NOT EXISTS sync_log_one_running_per_user
  ON sync_log (user_id)
  WHERE status = 'RUNNING';
