-- Soporte para Outlook como segundo proveedor de correo
ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS outlook_refresh_token text DEFAULT NULL;
