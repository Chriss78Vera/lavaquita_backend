import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";
import { RoomService } from "../src/services/roomService.js";

const buildApp = () => createApp({
  roomService: new RoomService(new MemoryRepository()),
  ocrService: { readTotal: async () => ({ total: 20, currency: "COP", confidence: 1 }) },
});

test("flujo principal: crear, unir, fijar cuenta y dividir", async () => {
  const app = buildApp();
  const created = await request(app).post("/api/rooms").send({ hostName: "Ana" }).expect(201);
  const { code } = created.body.room;
  await request(app).post(`/api/rooms/${code}/participants`).send({ name: "Mateo" }).expect(201);
  await request(app).patch(`/api/rooms/${code}/bill`)
    .set("x-host-token", created.body.hostToken).send({ amount: 10, currency: "COP" }).expect(200);
  const split = await request(app).get(`/api/rooms/${code}/split`).expect(200);
  assert.equal(split.body.shares.length, 2);
  assert.equal(split.body.shares.reduce((sum, share) => sum + share.amountCents, 0), 1000);
});

test("solo el anfitrión puede iniciar la ruleta", async () => {
  const app = buildApp();
  const created = await request(app).post("/api/rooms").send({ hostName: "Ana" });
  const { code } = created.body.room;
  await request(app).post(`/api/rooms/${code}/games/roulette`).send({ payerCount: 1 }).expect(401);
});

test("ruleta no repite pagadores y dados permiten desempate", async () => {
  const app = buildApp();
  const created = await request(app).post("/api/rooms").send({ hostName: "Ana" });
  const { code } = created.body.room;
  const token = created.body.hostToken;
  await request(app).post(`/api/rooms/${code}/participants`).send({ name: "Mateo" }).expect(201);
  await request(app).post(`/api/rooms/${code}/participants`).send({ name: "Sofi" }).expect(201);
  await request(app).patch(`/api/rooms/${code}/bill`).set("x-host-token", token)
    .send({ amount: 84.6 }).expect(200);

  const roulette = await request(app).post(`/api/rooms/${code}/games/roulette`)
    .set("x-host-token", token).send({ payerCount: 2 }).expect(201);
  const payerIds = roulette.body.payload.payers.map((payer) => payer.id);
  assert.equal(new Set(payerIds).size, 2);
  assert.equal(roulette.body.payload.shares.reduce((sum, share) => sum + share.amountCents, 0), 8460);

  const dice = await request(app).post(`/api/rooms/${code}/games/dice`)
    .set("x-host-token", token).send({}).expect(201);
  assert.ok(["dice_result", "dice_tie"].includes(dice.body.type));
  assert.equal(dice.body.payload.results.length, 3);
});

test("el QR contiene el código y QuickChart solo dibuja la invitación", async () => {
  const app = buildApp();
  const created = await request(app).post("/api/rooms").send({ hostName: "Ana" });
  const { code } = created.body.room;
  const qr = await request(app).get(`/api/rooms/${code}/qr`).expect(200);
  assert.equal(qr.body.invitation, code);
  assert.match(qr.body.qrUrl, /^https:\/\/quickchart\.io\/qr\?/);
});

test("la división iniciada por el anfitrión queda sincronizada como evento", async () => {
  const app = buildApp();
  const created = await request(app).post("/api/rooms").send({ hostName: "Ana" });
  const { code } = created.body.room;
  const token = created.body.hostToken;
  await request(app).post(`/api/rooms/${code}/participants`).send({ name: "Mateo" }).expect(201);
  await request(app).patch(`/api/rooms/${code}/bill`).set("x-host-token", token).send({ amount: 10 }).expect(200);
  const event = await request(app).post(`/api/rooms/${code}/games/split`).set("x-host-token", token).send({}).expect(201);
  assert.equal(event.body.type, "split");
  assert.equal(event.body.payload.shares.reduce((sum, share) => sum + share.amountCents, 0), 1000);
  const room = await request(app).get(`/api/rooms/${code}`).expect(200);
  assert.equal(room.body.latestEvent.type, "split");
});

test("el anfitrión puede cerrar y eliminar una sala temporal", async () => {
  const app = buildApp();
  const first = await request(app).post("/api/rooms").send({ hostName: "Ana" });
  await request(app).post(`/api/rooms/${first.body.room.code}/close`)
    .set("x-host-token", first.body.hostToken).send({}).expect(200);
  await request(app).get(`/api/rooms/${first.body.room.code}`).expect(410);
  await request(app).post(`/api/rooms/${first.body.room.code}/participants`)
    .send({ name: "Mateo" }).expect(410);

  const second = await request(app).post("/api/rooms").send({ hostName: "Sofi" });
  await request(app).delete(`/api/rooms/${second.body.room.code}`)
    .set("x-host-token", second.body.hostToken).expect(204);
  await request(app).get(`/api/rooms/${second.body.room.code}`).expect(404);
});
