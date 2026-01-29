import Redis from "ioredis";

export function createStore(redisUrl) {
  if (redisUrl) {
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    return {
      kind: "redis",
      async set(key, value, ttlSec) {
        await redis.set(key, JSON.stringify(value), "EX", ttlSec);
      },
      async get(key) {
        const v = await redis.get(key);
        return v ? JSON.parse(v) : null;
      },
      async del(key) {
        await redis.del(key);
      }
    };
  }

  // In-memory fallback (links lost on restart)
  const mem = new Map();
  return {
    kind: "memory",
    async set(key, value, ttlSec) {
      mem.set(key, { value, exp: Date.now() + ttlSec * 1000 });
    },
    async get(key) {
      const row = mem.get(key);
      if (!row) return null;
      if (Date.now() > row.exp) {
        mem.delete(key);
        return null;
      }
      return row.value;
    },
    async del(key) {
      mem.delete(key);
    }
  };
}
