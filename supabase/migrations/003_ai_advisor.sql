-- Tabla para cachear los insights generados por Gemini
CREATE TABLE IF NOT EXISTS ai_insights (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes            text NOT NULL,
  insights       jsonb NOT NULL DEFAULT '[]',
  generated_at   timestamptz NOT NULL DEFAULT now(),
  context_hash   text NOT NULL DEFAULT '',
  CONSTRAINT ai_insights_unique UNIQUE (user_id, mes)
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own insights"
  ON ai_insights FOR ALL
  USING (auth.uid() = user_id);

-- Tabla para el historial del chat conversacional
CREATE TABLE IF NOT EXISTS chat_messages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes        text NOT NULL,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own chat messages"
  ON chat_messages FOR ALL
  USING (auth.uid() = user_id);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS ai_insights_user_mes ON ai_insights (user_id, mes);
CREATE INDEX IF NOT EXISTS chat_messages_user_mes ON chat_messages (user_id, mes, created_at DESC);
