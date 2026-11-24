import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import { z } from "zod";
import { config } from "./config.js";
import { asyncHandler, ApiError } from "./utils/errors.js";

const roomCode = (request) => request.params.code.toUpperCase();
const hostToken = (request) => request.header("x-host-token");
const participantToken = (request) => request.header("x-participant-token");

const createRoomSchema = z.object({
  hostName: z.string().trim().min(1).max(30),
  hostAvatar: z.string().trim().min(1).max(30).optional(),
});
const joinRoomSchema = z.object({
  name: z.string().trim().min(1).max(30),
  avatar: z.string().trim().min(1).max(30).optional(),
});
const billSchema = z.object({
  amount: z.union([z.number(), z.string()]),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
});
const rouletteSchema = z.object({ payerCount: z.number().int().positive() });
const diceSchema = z.object({ participantIds: z.array(z.string().uuid()).min(2).optional() });

const validate = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "Datos inválidos", result.error.flatten());
  return result.data;
};

export const createApp = ({ roomService, ocrService, emit = () => {}, persistence = "memory" }) => {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.ocrMaxImageMb * 1024 * 1024 },
    fileFilter: (_request, file, callback) => callback(null, file.mimetype.startsWith("image/")),
  });

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins.includes("*") ? true : config.clientOrigins }));
  app.use(express.json({ limit: "1mb" }));
  if (config.nodeEnv !== "test") app.use(morgan("dev"));

  app.get("/health", (_request, response) => response.json({
    ok: true,
    service: "lavaquita-backend",
    persistence,
  }));

  app.post("/api/rooms", asyncHandler(async (request, response) => {
    const result = await roomService.createRoom(validate(createRoomSchema, request.body));
    response.status(201).json(result);
  }));

  app.get("/api/rooms/:code", asyncHandler(async (request, response) => {
    response.json(await roomService.getRoom(roomCode(request)));
  }));

  app.get("/api/rooms/:code/qr", asyncHandler(async (request, response) => {
    const room = await roomService.getRoom(roomCode(request));
    const invitation = request.query.invitationUrl
      ? `${request.query.invitationUrl}${encodeURIComponent(room.code)}`
      : room.code;
    const qrUrl = `https://quickchart.io/qr?size=320&margin=2&text=${encodeURIComponent(invitation)}`;
    response.json({ code: room.code, invitation, qrUrl });
  }));

  app.post("/api/rooms/:code/participants", asyncHandler(async (request, response) => {
    const code = roomCode(request);
    const result = await roomService.joinRoom(code, validate(joinRoomSchema, request.body));
    emit(code, "participant_joined", result.participant);
    response.status(201).json(result);
  }));

  app.delete("/api/rooms/:code/participants/me", asyncHandler(async (request, response) => {
    const code = roomCode(request);
    const participant = await roomService.leaveRoom(code, participantToken(request));
    emit(code, "participant_left", participant);
    response.status(204).end();
  }));

  app.patch("/api/rooms/:code/bill", asyncHandler(async (request, response) => {
    const code = roomCode(request);
    const room = await roomService.setBill(code, hostToken(request), validate(billSchema, request.body));
    emit(code, "bill_updated", room);
    response.json(room);
  }));

  app.post("/api/rooms/:code/close", asyncHandler(async (request, response) => {
    const code = roomCode(request);
    const room = await roomService.closeRoom(code, hostToken(request));
    emit(code, "room_closed", { code });
    response.json(room);
  }));

  app.delete("/api/rooms/:code", asyncHandler(async (request, response) => {
    const code = roomCode(request);
    await roomService.deleteRoom(code, hostToken(request));
    emit(code, "room_deleted", { code });
    response.status(204).end();
  }));

  app.get("/api/rooms/:code/split", asyncHandler(async (request, response) => {
    response.json(await roomService.split(roomCode(request)));
  }));

  app.post("/api/rooms/:code/games/split", asyncHandler(async (request, response) => {
    const code = roomCode(request);
    const event = await roomService.splitGame(code, hostToken(request));
    emit(code, "game_event", event);
    response.status(201).json(event);
  }));

  app.post("/api/rooms/:code/games/roulette", asyncHandler(async (request, response) => {
    const code = roomCode(request);
    const { payerCount } = validate(rouletteSchema, request.body);
    const event = await roomService.roulette(code, hostToken(request), payerCount);
    emit(code, "game_event", event);
    response.status(201).json(event);
  }));

  app.post("/api/rooms/:code/games/dice", asyncHandler(async (request, response) => {
    const code = roomCode(request);
    const { participantIds } = validate(diceSchema, request.body);
    const event = await roomService.dice(code, hostToken(request), participantIds);
    emit(code, "game_event", event);
    response.status(201).json(event);
  }));

  app.post("/api/ocr/total", upload.single("image"), asyncHandler(async (request, response) => {
    if (!request.file) throw new ApiError(400, "Envía una imagen en el campo 'image'");
    response.json(await ocrService.readTotal(request.file));
  }));

  app.use((_request, _response, next) => next(new ApiError(404, "Ruta no encontrada")));
  app.use((error, _request, response, _next) => {
    const status = error.status ?? (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
    if (status >= 500 && config.nodeEnv !== "test") console.error(error);
    response.status(status).json({
      error: error.message ?? "Error interno del servidor",
      ...(error.details ? { details: error.details } : {}),
    });
  });

  return app;
};
