import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { config, configuredSupabaseKeyKind, hasSupabaseConfig } from "./config.js";
import { MemoryRepository } from "./repositories/memoryRepository.js";
import { SupabaseRepository } from "./repositories/supabaseRepository.js";
import { OcrService } from "./services/ocrService.js";
import { RoomService } from "./services/roomService.js";
import { configureRealtime } from "./realtime.js";

if (!hasSupabaseConfig && !config.useMemoryRepository) {
  throw new Error(
    "Supabase es obligatorio. Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env. "
    + `La clave actual es de tipo '${configuredSupabaseKeyKind}', debe ser 'service_role' o 'sb_secret'. `
    + "Para desarrollo temporal en memoria define USE_MEMORY_REPOSITORY=true.",
  );
}

const persistence = hasSupabaseConfig ? "supabase" : "memory";
const repository = hasSupabaseConfig
  ? new SupabaseRepository(config.supabaseUrl, config.supabaseServiceRoleKey)
  : new MemoryRepository();
await repository.healthCheck();
const roomService = new RoomService(repository, { roomTtlHours: config.roomTtlHours });
const ocrService = new OcrService({
  apiUrl: config.ocrApiUrl,
  apiKey: config.ocrApiKey,
  model: config.ocrModel,
});

let io;
const app = createApp({
  roomService,
  ocrService,
  persistence,
  emit: (code, event, payload) => io?.to(code).emit(event, payload),
});
const server = createServer(app);
io = new Server(server, {
  cors: { origin: config.clientOrigins.includes("*") ? true : config.clientOrigins },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
});

configureRealtime(io, roomService);

server.listen(config.port, () => {
  console.log(`La Vaquita API escuchando en http://localhost:${config.port}`);
  console.log(`Persistencia: ${persistence}`);
});
