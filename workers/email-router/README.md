# billeteclaro-email-router

Worker de Cloudflare que recibe los correos reenviados por los usuarios a
`*@billeteclaro.com`, los parsea y los reenvía a `/api/ingest/forward`.

## Setup (una sola vez, manual — requiere tu cuenta de Cloudflare)

1. **Instalar dependencias**: `cd workers/email-router && npm install`
2. **Login**: `npx wrangler login`
3. **Configurar el secreto compartido** (mismo valor que `FORWARD_INGEST_SECRET` en las
   variables de entorno de Vercel):
   ```
   npx wrangler secret put FORWARD_INGEST_SECRET
   ```
4. **Deploy**: `npx wrangler deploy`
5. **Activar Email Routing en Cloudflare** (dashboard, no CLI):
   - Email Routing → "Onboard Domain" sobre `billeteclaro.com` (agrega automáticamente los
     MX/TXT necesarios en la zona raíz — no hace falta subdominio aparte).
   - Routing rules → Catch-all address → Action: **Send to a Worker** →
     selecciona `billeteclaro-email-router`.

## Desarrollo local

`npx wrangler dev` no puede recibir correos reales (Email Routing no enruta a un worker local),
pero sirve para revisar errores de tipos/build. Para probar el flujo completo hay que
deployar y enviar un correo real de prueba.
