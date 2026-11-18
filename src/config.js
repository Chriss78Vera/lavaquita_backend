import "dotenv/config";

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
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
};

export const hasSupabaseConfig = Boolean(
  config.supabaseUrl && config.supabaseServiceRoleKey,
);
