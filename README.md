# La Vaquita Backend

Backend sencillo para la aplicación móvil **La Vaquita**. Está hecho con Node.js, Express y Socket.IO; usa Supabase cuando se configuran sus credenciales y memoria local durante el desarrollo.

## Funcionalidades incluidas

- Salas temporales sin registro, con código `XXXX-00`.
- Participantes con nombre y avatar (máximo 10).
- Token privado de anfitrión para modificar la cuenta e iniciar juegos.
- Total manual o detectado mediante una IA de visión/OCR.
- División exacta: los centavos sobrantes se reparten sin alterar el total.
- Ruleta sin participantes repetidos.
- Dados, empates y rondas de desempate.
- QR generado por QuickChart; QuickChart solo dibuja la invitación.
- Eventos sincronizados mediante Socket.IO.
- Persistencia en Supabase con RLS cerrado al acceso público.

## Inicio rápido

Requiere Node.js 20 o posterior.

```bash
npm install
copy .env.example .env
npm run dev
```

Sin credenciales de Supabase la API funciona en memoria y los datos se borran al reiniciar. Comprueba el servicio en `GET http://localhost:3000/health`.

## Configurar Supabase

1. Crea un proyecto en Supabase.
2. Abre el SQL Editor y ejecuta [`supabase/schema.sql`](supabase/schema.sql).
3. Copia `.env.example` como `.env`.
4. Define `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
5. Nunca incluyas la service role en la aplicación MAUI ni la subas a Git.

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
- `game_event`

En producción con varias instancias del backend se debe agregar un adaptador compartido de Socket.IO (por ejemplo Redis) para que todas emitan los mismos eventos.

## Pruebas

```bash
npm test
```

Las pruebas usan el repositorio en memoria y no necesitan Supabase ni claves externas.

## Nota para Android e iOS

En un emulador Android, `localhost` apunta al emulador; normalmente se usa `http://10.0.2.2:3000`. En iOS Simulator suele funcionar `http://localhost:3000`. Para dispositivos físicos utiliza una URL HTTPS accesible desde la red o despliega el backend.
