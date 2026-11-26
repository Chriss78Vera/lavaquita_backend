# La Vaquita Backend

API Node.js para salas, participantes, cuentas, juegos, OCR y comunicación en tiempo real.

## Autores

- Christopher Vera
- Jordan Paillacho

## Iniciar

Requiere Node.js 20.9 o superior.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Antes de iniciar:

1. Ejecuta `supabase/schema.sql` en Supabase.
2. Completa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env`.
3. Para OCR local, inicia Ollama con los comandos de la sección siguiente.

La clave debe ser `service_role` o `sb_secret_`, nunca `anon` o `sb_publishable_`.

Las tablas no tienen políticas públicas. La app móvil habla con este backend, y únicamente el backend accede a Supabase.

## OCR local con Ollama

Desde `lavaquita_backend` y con Docker Desktop iniciado:

```powershell
docker compose up -d ollama
docker compose exec ollama ollama pull qwen2.5vl:3b
```

La descarga del modelo se hace una vez. Docker guarda el modelo en un volumen. Configura estas variables en el `.env` del backend:

```env
OCR_API_URL=http://127.0.0.1:11435/v1/chat/completions
OCR_API_KEY=
OCR_MODEL=qwen2.5vl:3b
```

Inicia el backend con `npm run dev`. Node.js se ejecuta en el host y envía la imagen a Ollama mediante HTTP. El puerto 11435 está disponible únicamente en el equipo anfitrión. La primera lectura puede tardar más porque el modelo debe cargarse en memoria.

Para probar con una factura de ejemplo:

```powershell
curl.exe -F "image=@factura.png" http://localhost:3000/api/ocr/total
```

El backend corrige la orientación indicada por los metadatos de la foto y reduce su resolución en memoria antes de enviarla a Ollama. El modelo devuelve un total sugerido para revisión. Si Ollama no está disponible, se puede ingresar el monto manualmente. Para usar otro proveedor compatible con `chat/completions`, cambia la URL, el modelo y la clave si el proveedor la requiere.

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
