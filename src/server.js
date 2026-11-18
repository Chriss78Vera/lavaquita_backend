import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { config, hasSupabaseConfig } from "./config.js";
import { MemoryRepository } from "./repositories/memoryRepository.js";
import { SupabaseRepository } from "./repositories/supabaseRepository.js";
import { OcrService } from "./services/ocrService.js";
import { RoomService } from "./services/roomService.js";

const repository = hasSupabaseConfig
  ? new SupabaseRepository(config.supabaseUrl, config.supabaseServiceRoleKey)
  : new MemoryRepository();
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
  emit: (code, event, payload) => io?.to(code).emit(event, payload),
});
const server = createServer(app);
io = new Server(server, {
  cors: { origin: config.clientOrigins.includes("*") ? true : config.clientOrigins },
});

io.on("connection", (socket) => {
  socket.on("join_room", async (code, acknowledge) => {
    try {
      const room = await roomService.getRoom(String(code).toUpperCase());
      socket.join(room.code);
      acknowledge?.({ ok: true, room });
    } catch (error) {
      acknowledge?.({ ok: false, error: error.message });
    }
  });
});

server.listen(config.port, () => {
  console.log(`La Vaquita API escuchando en http://localhost:${config.port}`);
  console.log(`Persistencia: ${hasSupabaseConfig ? "Supabase" : "memoria (desarrollo)"}`);
});
