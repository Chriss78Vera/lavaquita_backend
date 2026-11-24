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

Las tablas no tienen políticas públicas. La app móvil habla con este backend, y únicamente el backend accede a Supabase.

## Configurar OCR

El adaptador acepta una API de visión compatible con el endpoint `chat/completions` de OpenAI. Configura:

```env
OCR_API_URL=https://api.tu-proveedor.com/v1/chat/completions
OCR_API_KEY=tu_clave
OCR_MODEL=tu_modelo_con_vision
```

La imagen se procesa en memoria y no se guarda. Una opción recomendada es DeepSeek Vision, sin instalar una IA local:

```env
OCR_API_URL=https://api.deepseek.com/chat/completions
OCR_API_KEY=tu_clave_deepseek
OCR_MODEL=deepseek-flash
```

Si la IA aún no está configurada, el endpoint devuelve `503` y la app debe mantener disponible el monto manual. No pongas la API key en la aplicación MAUI ni la subas a Git; debe permanecer únicamente en el backend.

Si tu IA usa otro formato, solo hay que adaptar [`src/services/ocrService.js`](src/services/ocrService.js); el contrato hacia MAUI no cambia.

## API principal

| Método | Ruta | Uso |
| --- | --- | --- |
| `POST` | `/api/rooms` | Crear sala y recibir tokens temporales |
| `GET` | `/api/rooms/:code` | Validar y consultar sala |
| `GET` | `/api/rooms/:code/qr` | Obtener URL de QR QuickChart |
| `POST` | `/api/rooms/:code/participants` | Unirse sin login |
| `PATCH` | `/api/rooms/:code/bill` | Confirmar total (requiere `x-host-token`) |
| `POST` | `/api/rooms/:code/close` | Desactivar una sala y su código |
| `DELETE` | `/api/rooms/:code` | Eliminar sala y datos temporales |
| `GET` | `/api/rooms/:code/split` | División exacta |
| `POST` | `/api/rooms/:code/games/split` | Dividir y sincronizar el resultado |
| `POST` | `/api/rooms/:code/games/roulette` | Elegir pagadores |
| `POST` | `/api/rooms/:code/games/dice` | Lanzar o desempatar dados |
| `POST` | `/api/ocr/total` | Leer imagen multipart, campo `image` |

### Ejemplo mínimo

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"hostName":"Ana","hostAvatar":"sparkles"}'
```

Guarda `hostToken` solamente en el dispositivo del anfitrión. Para confirmar una cuenta:

```bash
curl -X PATCH http://localhost:3000/api/rooms/ABCD-12/bill \
  -H "Content-Type: application/json" \
  -H "x-host-token: TOKEN_RECIBIDO" \
  -d '{"amount":84.60,"currency":"USD"}'
```

## Tiempo real

Conecta Socket.IO a la misma URL de la API y emite:

```js
socket.emit("join_room", "ABCD-12", (result) => console.log(result));
```

Eventos que recibe el cliente:

- `participant_joined`
- `bill_updated`
- `game_started`
- `game_event`

En producción con varias instancias del backend se debe agregar un adaptador compartido de Socket.IO (por ejemplo Redis) para que todas emitan los mismos eventos.

## Pruebas

```powershell
npm test
```
