import { randomUUID } from "node:crypto";

export class MemoryRepository {
  constructor() {
    this.rooms = new Map();
    this.participants = new Map();
    this.events = new Map();
  }

  async healthCheck() {
    return true;
  }

  async createRoom(room) {
    const saved = { id: randomUUID(), ...room, createdAt: new Date().toISOString() };
    this.rooms.set(saved.code, saved);
    this.participants.set(saved.code, []);
    this.events.set(saved.code, []);
    return saved;
  }

  async findRoom(code) {
    const room = this.rooms.get(code);
    if (!room || new Date(room.expiresAt) <= new Date()) return null;
    return room;
  }

  async updateRoom(code, changes) {
    const room = await this.findRoom(code);
    if (!room) return null;
    const updated = { ...room, ...changes, updatedAt: new Date().toISOString() };
    this.rooms.set(code, updated);
    return updated;
  }

  async deleteRoom(code) {
    this.rooms.delete(code);
    this.participants.delete(code);
    this.events.delete(code);
  }

  async listParticipants(code) {
    return [...(this.participants.get(code) ?? [])];
  }

  async createParticipant(code, participant) {
    const saved = { id: randomUUID(), roomCode: code, ...participant, joinedAt: new Date().toISOString() };
    const participants = this.participants.get(code) ?? [];
    participants.push(saved);
    this.participants.set(code, participants);
    return saved;
  }

  async findParticipantByTokenHash(code, tokenHash) {
    return (this.participants.get(code) ?? []).find((item) => item.tokenHash === tokenHash) ?? null;
  }

  async removeParticipant(code, participantId) {
    const participants = this.participants.get(code) ?? [];
    this.participants.set(code, participants.filter((item) => item.id !== participantId));
  }

  async createEvent(code, event) {
    const saved = { id: randomUUID(), roomCode: code, ...event, createdAt: new Date().toISOString() };
    const events = this.events.get(code) ?? [];
    events.push(saved);
    this.events.set(code, events);
    return saved;
  }

  async latestEvent(code) {
    return (this.events.get(code) ?? []).at(-1) ?? null;
  }
}
