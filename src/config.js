import "dotenv/config";

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const booleanFromEnv = (name, fallback = false) => {
  const value = process.env[name];
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

export const config = {
  port: numberFromEnv("PORT", 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  clientOrigins: (process.env.CLIENT_ORIGINS ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  roomTtlHours: numberFromEnv("ROOM_TTL_HOURS", 12),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ocrApiUrl: process.env.OCR_API_URL,
  ocrApiKey: process.env.OCR_API_KEY,
  ocrModel: process.env.OCR_MODEL,
  ocrMaxImageMb: numberFromEnv("OCR_MAX_IMAGE_MB", 8),
  useMemoryRepository: booleanFromEnv("USE_MEMORY_REPOSITORY") || process.env.NODE_ENV === "test",
};

const supabaseKeyKind = (key) => {
  if (!key) return "missing";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable";
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    return payload.role ?? "unknown";
  } catch {
    return "unknown";
  }
};

export const configuredSupabaseKeyKind = supabaseKeyKind(config.supabaseServiceRoleKey);
export const hasSupabaseConfig = Boolean(
  config.supabaseUrl
  && config.supabaseServiceRoleKey
  && !config.supabaseUrl.includes("TU-PROYECTO")
  && config.supabaseServiceRoleKey !== "TU_SERVICE_ROLE_KEY"
  && ["secret", "service_role"].includes(configuredSupabaseKeyKind),
);
