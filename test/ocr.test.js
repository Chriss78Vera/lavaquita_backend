import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { OcrService } from "../src/services/ocrService.js";

test("el OCR envía la imagen a Ollama sin clave y conserva el contrato móvil", async () => {
  let received;
  const provider = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { url: req.url, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks)) };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      choices: [{ message: { content: '{"total":18.75,"currency":"USD","confidence":0.8}' } }],
    }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const ocrService = new OcrService({
    apiUrl: `http://127.0.0.1:${provider.address().port}/v1/chat/completions`,
    model: "qwen2.5vl:3b",
  });
  const app = createApp({ ocrService });
  const image = Buffer.from("test-image");

  try {
    const result = await request(app).post("/api/ocr/total")
      .attach("image", image, { filename: "receipt.png", contentType: "image/png" }).expect(200);
    assert.deepEqual(result.body, { total: 18.75, currency: "USD", confidence: 0.8 });
    assert.equal(received.url, "/v1/chat/completions");
    assert.equal(received.auth, undefined);
    assert.equal(received.body.model, "qwen2.5vl:3b");
    assert.equal(received.body.messages[0].content[1].image_url.url, `data:image/png;base64,${image.toString("base64")}`);
  } finally {
    await new Promise((resolve) => provider.close(resolve));
  }
});
