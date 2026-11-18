import { ApiError } from "../utils/errors.js";

const findJson = (value) => {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
};

export class OcrService {
  constructor({ apiUrl, apiKey, model }) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  get configured() {
    return Boolean(this.apiUrl && this.model);
  }

  async readTotal(file) {
    if (!this.configured) {
      throw new ApiError(503, "OCR no configurado; usa el ingreso manual o configura OCR_API_URL y OCR_MODEL");
    }

    const image = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Lee esta factura. Devuelve solamente JSON con total numérico, moneda ISO de 3 letras y confianza entre 0 y 1. Prefiere el total final después de impuestos. Ejemplo: {\"total\":84.60,\"currency\":\"USD\",\"confidence\":0.95}" },
            { type: "image_url", image_url: { url: image } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new ApiError(502, "La IA de OCR no pudo procesar la imagen");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? findJson(content) : content;
    const total = Number(parsed?.total);
    if (!Number.isFinite(total) || total <= 0) {
      throw new ApiError(422, "No se pudo detectar un total confiable; ingrésalo manualmente");
    }

    return {
      total,
      currency: String(parsed.currency ?? "COP").toUpperCase().slice(0, 3),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    };
  }
}
