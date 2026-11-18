import { ApiError } from "./errors.js";

export const toCents = (amount) => {
  const numericAmount = typeof amount === "string" ? Number(amount.replace(",", ".")) : amount;
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new ApiError(400, "El monto debe ser un número mayor que cero");
  }
  return Math.round((numericAmount + Number.EPSILON) * 100);
};

export const fromCents = (cents) => Number((cents / 100).toFixed(2));

export const splitCents = (totalCents, participants) => {
  if (!Array.isArray(participants) || participants.length < 2) {
    throw new ApiError(400, "Se necesitan al menos dos participantes");
  }

  const base = Math.floor(totalCents / participants.length);
  const remainder = totalCents % participants.length;
  return participants.map((participant, index) => ({
    participantId: participant.id,
    name: participant.name,
    amountCents: base + (index < remainder ? 1 : 0),
    amount: fromCents(base + (index < remainder ? 1 : 0)),
  }));
};
