import { createHash, randomBytes, randomInt } from "node:crypto";

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export const createToken = () => randomBytes(24).toString("base64url");

export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");

export const createRoomCode = () => {
  const letters = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join("");
  return `${letters}-${randomInt(10, 100)}`;
};

export const secureShuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};
