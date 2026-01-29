import "dotenv/config";

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const CFG = {
  PORT: parseInt(process.env.PORT || "8080", 10),
  BOT_TOKEN: must("BOT_TOKEN"),
  BASE_URL: must("BASE_URL").replace(/\/$/, ""),
  ADMIN_ID: process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID, 10) : null, // optional
  REDIS_URL: process.env.REDIS_URL || null, // recommended
  LINK_TTL_SEC: parseInt(process.env.LINK_TTL_SEC || "86400", 10), // 24h
  MAX_MB: parseInt(process.env.MAX_MB || "0", 10) // 0 = no server-side size check
};
