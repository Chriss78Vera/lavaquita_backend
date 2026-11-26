import sharp from "sharp";
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
      throw new ApiError(503, "OCR no configurado. Usa el ingreso manual o configura OCR_API_URL y OCR_MODEL.");
    }

    const prepared = await sharp(file.buffer, { limitInputPixels: 50_000_000 })
      .autoOrient()
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 86 })
      .toBuffer()
      .catch(() => {
        throw new ApiError(422, "No se pudo abrir la imagen. Envía una foto JPG o PNG, o ingresa el monto manualmente.");
      });
    const image = `data:image/jpeg;base64,${prepared.toString("base64")}`;
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: 100,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Lee esta factura. Devuelve solamente JSON con total numérico en dólares estadounidenses, currency siempre USD y confidence entre 0 y 1. Prefiere el total final después de impuestos. No conviertas monedas. Ejemplo: {\"total\":84.60,\"currency\":\"USD\",\"confidence\":0.95}" },
            { type: "image_url", image_url: { url: image } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch((error) => {
      if (error.name === "TimeoutError") {
        throw new ApiError(504, "La lectura de la factura tardó demasiado. Puedes ingresar el total manualmente.");
      }
      throw new ApiError(503, "El servicio de OCR no está disponible. Puedes ingresar el total manualmente.");
    });

    if (!response.ok) {
      throw new ApiError(502, "La IA de OCR no pudo procesar la imagen");
    }

    const data = await response.json().catch((error) => {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        throw new ApiError(504, "La lectura de la factura tardó demasiado. Puedes ingresar el total manualmente.");
      }
      throw new ApiError(502, "El servicio de OCR devolvió una respuesta inválida.");
    });
    const content = data.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? findJson(content) : content;
    const rawTotal = parsed?.total;
    const total = typeof rawTotal === "string" ? Number(rawTotal) : rawTotal;
    if (!Number.isFinite(total) || total <= 0) {
      throw new ApiError(422, "No se pudo detectar un total confiable; ingrésalo manualmente");
    }

    return {
      total,
      currency: "USD",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    };
  }
}
