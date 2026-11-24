# La Vaquita Backend

API Node.js para salas, participantes, cuentas, juegos, OCR y comunicación en tiempo real.

## Autores

- Christopher Vera
- Jordan Paillacho

## Iniciar

Requiere Node.js 20 o superior.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Antes de iniciar:

1. Ejecuta `supabase/schema.sql` en Supabase.
2. Completa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env`.
3. Para OCR completa `OCR_API_URL`, `OCR_API_KEY` y `OCR_MODEL`.

La clave debe ser `service_role` o `sb_secret_`, nunca `anon` o `sb_publishable_`.

```powershell
npm test
```
