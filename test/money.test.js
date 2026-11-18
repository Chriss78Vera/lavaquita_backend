import test from "node:test";
import assert from "node:assert/strict";
import { splitCents, toCents } from "../src/utils/money.js";

test("divide centavos sin perder el total", () => {
  const participants = ["Ana", "Mateo", "Sofi"].map((name, index) => ({ id: String(index), name }));
  const shares = splitCents(toCents(10), participants);
  assert.deepEqual(shares.map((share) => share.amountCents), [334, 333, 333]);
  assert.equal(shares.reduce((sum, share) => sum + share.amountCents, 0), 1000);
});
