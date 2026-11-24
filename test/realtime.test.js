import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as createClient } from "socket.io-client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { configureRealtime } from "../src/realtime.js";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";
import { RoomService } from "../src/services/roomService.js";

test("dos clientes reciben los cambios de su sala en tiempo real", async (context) => {
  const roomService = new RoomService(new MemoryRepository());
  let io;
  const app = createApp({
    roomService,
    ocrService: { readTotal: async () => ({ total: 10, currency: "USD", confidence: 1 }) },
    emit: (code, event, payload) => io.to(code).emit(event, payload),
  });
  const httpServer = createServer(app);
  io = new Server(httpServer);
  configureRealtime(io, roomService);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));

  const address = httpServer.address();
  const hostClient = createClient(`http://127.0.0.1:${address.port}`, { transports: ["websocket"] });
  const guestClient = createClient(`http://127.0.0.1:${address.port}`, { transports: ["websocket"] });
  context.after(() => {
    hostClient.disconnect();
    guestClient.disconnect();
    io.close();
    httpServer.close();
  });

  await Promise.all([hostClient, guestClient].map((client) => new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  })));

  const created = await request(app).post("/api/rooms").send({ hostName: "Ana" }).expect(201);
  const code = created.body.room.code;
  const joined = await new Promise((resolve) => hostClient.emit("join_room", code, resolve));
  assert.equal(joined.ok, true);

  const participantEvent = new Promise((resolve) => hostClient.once("participant_joined", resolve));
  await request(app).post(`/api/rooms/${code}/participants`).send({ name: "Mateo" }).expect(201);
  const participant = await participantEvent;
  assert.equal(participant.name, "Mateo");

  const guestJoined = await new Promise((resolve) => guestClient.emit("join_room", code, resolve));
  assert.equal(guestJoined.ok, true);
  const hostGameEvent = new Promise((resolve) => hostClient.once("game_event", resolve));
  const guestGameEvent = new Promise((resolve) => guestClient.once("game_event", resolve));
  await request(app).patch(`/api/rooms/${code}/bill`)
    .set("x-host-token", created.body.hostToken).send({ amount: 24, currency: "USD" }).expect(200);
  await request(app).post(`/api/rooms/${code}/games/split`)
    .set("x-host-token", created.body.hostToken).send({}).expect(201);
  const [hostGame, guestGame] = await Promise.all([hostGameEvent, guestGameEvent]);
  assert.equal(hostGame.id, guestGame.id);
  assert.equal(guestGame.type, "split");
  assert.equal(guestGame.payload.shares.length, 2);
});
