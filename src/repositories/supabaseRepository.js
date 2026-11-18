import { createClient } from "@supabase/supabase-js";

const roomFromDatabase = (room) => room && ({
  id: room.id,
  code: room.code,
  hostName: room.host_name,
  hostAvatar: room.host_avatar,
  hostTokenHash: room.host_token_hash,
  amountCents: room.amount_cents,
  currency: room.currency,
  status: room.status,
  expiresAt: room.expires_at,
  createdAt: room.created_at,
  updatedAt: room.updated_at,
});

const participantFromDatabase = (participant) => ({
  id: participant.id,
  roomCode: participant.room_code,
  name: participant.name,
  avatar: participant.avatar,
  tokenHash: participant.token_hash,
  isHost: participant.is_host,
  joinedAt: participant.joined_at,
});

export class SupabaseRepository {
  constructor(url, serviceRoleKey) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createRoom(room) {
    const { data, error } = await this.client.from("rooms").insert({
      code: room.code,
      host_name: room.hostName,
      host_avatar: room.hostAvatar,
      host_token_hash: room.hostTokenHash,
      amount_cents: room.amountCents,
      currency: room.currency,
      status: room.status,
      expires_at: room.expiresAt,
    }).select().single();
    if (error) throw error;
    return roomFromDatabase(data);
  }

  async findRoom(code) {
    const { data, error } = await this.client.from("rooms").select("*")
      .eq("code", code).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw error;
    return roomFromDatabase(data);
  }

  async updateRoom(code, changes) {
    const databaseChanges = { updated_at: new Date().toISOString() };
    if (changes.amountCents !== undefined) databaseChanges.amount_cents = changes.amountCents;
    if (changes.currency !== undefined) databaseChanges.currency = changes.currency;
    if (changes.status !== undefined) databaseChanges.status = changes.status;
    const { data, error } = await this.client.from("rooms").update(databaseChanges)
      .eq("code", code).select().single();
    if (error) throw error;
    return roomFromDatabase(data);
  }

  async deleteRoom(code) {
    const { error } = await this.client.from("rooms").delete().eq("code", code);
    if (error) throw error;
  }

  async listParticipants(code) {
    const { data, error } = await this.client.from("participants").select("*")
      .eq("room_code", code).order("joined_at");
    if (error) throw error;
    return data.map(participantFromDatabase);
  }

  async createParticipant(code, participant) {
    const { data, error } = await this.client.from("participants").insert({
      room_code: code,
      name: participant.name,
      avatar: participant.avatar,
      token_hash: participant.tokenHash,
      is_host: participant.isHost,
    }).select().single();
    if (error) throw error;
    return participantFromDatabase(data);
  }

  async removeParticipant(code, participantId) {
    const { error } = await this.client.from("participants").delete()
      .eq("room_code", code).eq("id", participantId);
    if (error) throw error;
  }

  async createEvent(code, event) {
    const { data, error } = await this.client.from("game_events").insert({
      room_code: code,
      type: event.type,
      payload: event.payload,
    }).select().single();
    if (error) throw error;
    return { id: data.id, roomCode: data.room_code, type: data.type, payload: data.payload, createdAt: data.created_at };
  }

  async latestEvent(code) {
    const { data, error } = await this.client.from("game_events").select("*")
      .eq("room_code", code).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data && { id: data.id, roomCode: data.room_code, type: data.type, payload: data.payload, createdAt: data.created_at };
  }
}
