import { randomInt } from "node:crypto";
import { ApiError } from "../utils/errors.js";
import { fromCents, splitCents, toCents } from "../utils/money.js";
import { createRoomCode, createToken, hashToken, secureShuffle } from "../utils/tokens.js";

const publicParticipant = ({ tokenHash, ...participant }) => participant;
const publicRoom = ({ hostTokenHash, ...room }) => ({
  ...room,
  amount: room.amountCents == null ? null : fromCents(room.amountCents),
});

export class RoomService {
  constructor(repository, { roomTtlHours = 12 } = {}) {
    this.repository = repository;
    this.roomTtlHours = roomTtlHours;
    this.snapshotCache = new Map();
  }

  invalidate(code) {
    this.snapshotCache.delete(code);
  }

  async uniqueRoomCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = createRoomCode();
      if (!(await this.repository.findRoom(code))) return code;
    }
    throw new ApiError(503, "No fue posible generar una sala; inténtalo de nuevo");
  }

  async createRoom({ hostName, hostAvatar = "sparkles" }) {
    const code = await this.uniqueRoomCode();
    const hostToken = createToken();
    const participantToken = createToken();
    const expiresAt = new Date(Date.now() + this.roomTtlHours * 3_600_000).toISOString();
    const room = await this.repository.createRoom({
      code,
      hostName,
      hostAvatar,
      hostTokenHash: hashToken(hostToken),
      amountCents: null,
      currency: "USD",
      status: "waiting",
      expiresAt,
    });
    const host = await this.repository.createParticipant(code, {
      name: hostName,
      avatar: hostAvatar,
      tokenHash: hashToken(participantToken),
      isHost: true,
    });
    return {
      room: publicRoom(room),
      host: publicParticipant(host),
      hostToken,
      participantToken,
    };
  }

  async getRoom(code) {
    const cached = this.snapshotCache.get(code);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const room = await this.repository.findRoom(code);
    if (!room) throw new ApiError(404, "La sala no existe o ya expiró");
    if (room.status === "closed") throw new ApiError(410, "La sala fue cerrada por el anfitrión");
    const participants = await this.repository.listParticipants(code);
    const latestEvent = await this.repository.latestEvent(code);
    const snapshot = {
      ...publicRoom(room),
      participants: participants.map(publicParticipant),
      latestEvent,
    };
    this.snapshotCache.set(code, { expiresAt: Date.now() + 3_000, value: snapshot });
    return snapshot;
  }

  async joinRoom(code, { name, avatar = "sparkles" }) {
    await this.getRoom(code);
    const participants = await this.repository.listParticipants(code);
    if (participants.length >= 10) throw new ApiError(409, "La sala ya tiene 10 participantes");
    if (participants.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new ApiError(409, "Ese nombre ya está en uso en la sala");
    }
    const participantToken = createToken();
    const participant = await this.repository.createParticipant(code, {
      name,
      avatar,
      tokenHash: hashToken(participantToken),
      isHost: false,
    });
    this.invalidate(code);
    return { participant: publicParticipant(participant), participantToken };
  }

  async assertHost(code, token) {
    const room = await this.repository.findRoom(code);
    if (!room) throw new ApiError(404, "La sala no existe o ya expiró");
    if (!token || hashToken(token) !== room.hostTokenHash) {
      throw new ApiError(401, "Token de anfitrión inválido");
    }
    return room;
  }

  async setBill(code, token, { amount }) {
    await this.assertHost(code, token);
    const room = await this.repository.updateRoom(code, {
      amountCents: toCents(amount),
      currency: "USD",
      status: "ready",
    });
    this.invalidate(code);
    return publicRoom(room);
  }

  async split(code) {
    const room = await this.getRoom(code);
    if (!room.amountCents) throw new ApiError(409, "Primero confirma el total de la cuenta");
    if (room.participants.length <= 2) throw new ApiError(409, "Para dividir la cuenta necesitas al menos 3 jugadores");
    const shares = splitCents(room.amountCents, room.participants);
    return { total: room.amount, currency: room.currency, shares };
  }

  async splitGame(code, token) {
    await this.assertHost(code, token);
    const result = await this.split(code);
    const event = await this.repository.createEvent(code, {
      type: "split",
      payload: result,
    });
    this.invalidate(code);
    return event;
  }

  async roulette(code, token, payerCount) {
    await this.assertHost(code, token);
    const room = await this.getRoom(code);
    if (!room.amountCents) throw new ApiError(409, "Primero confirma el total de la cuenta");
    if (payerCount < 1 || payerCount >= room.participants.length) {
      throw new ApiError(400, `payerCount debe estar entre 1 y ${room.participants.length - 1}`);
    }
    const payers = secureShuffle(room.participants).slice(0, payerCount);
    const shares = splitCents(room.amountCents, payers);
    const event = await this.repository.createEvent(code, {
      type: "roulette",
      payload: { payers: payers.map(publicParticipant), shares },
    });
    this.invalidate(code);
    return event;
  }

  async dice(code, token, participantIds) {
    await this.assertHost(code, token);
    const room = await this.getRoom(code);
    if (!room.amountCents) throw new ApiError(409, "Primero confirma el total de la cuenta");
    const selected = participantIds?.length
      ? room.participants.filter((item) => participantIds.includes(item.id))
      : room.participants;
    if (selected.length < 2) throw new ApiError(400, "Deben lanzar al menos dos participantes");
    const dicePerParticipant = selected.length > 6 ? 2 : 1;
    const results = selected.map((participant) => {
      const rolls = Array.from({ length: dicePerParticipant }, () => randomInt(1, 7));
      return { participant: publicParticipant(participant), rolls, total: rolls.reduce((sum, value) => sum + value, 0) };
    });
    const highest = Math.max(...results.map((result) => result.total));
    const winners = results.filter((result) => result.total === highest);
    const event = await this.repository.createEvent(code, {
      type: winners.length > 1 ? "dice_tie" : "dice_result",
      payload: {
        results,
        tiedParticipantIds: winners.length > 1 ? winners.map((item) => item.participant.id) : [],
        payer: winners.length === 1 ? winners[0].participant : null,
        amount: winners.length === 1 ? room.amount : null,
      },
    });
    this.invalidate(code);
    return event;
  }

  async closeRoom(code, token) {
    await this.assertHost(code, token);
    const room = await this.repository.updateRoom(code, { status: "closed" });
    this.invalidate(code);
    return publicRoom(room);
  }

  async deleteRoom(code, token) {
    await this.assertHost(code, token);
    await this.repository.deleteRoom(code);
    this.invalidate(code);
  }
}
