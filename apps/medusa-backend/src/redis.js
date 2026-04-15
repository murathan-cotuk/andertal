/**
 * Redis client — connects when REDIS_URL is set.
 * Falls back to a no-op cache in development / when Redis is unavailable.
 */

const logger = require("./logger");

let client = null;
let ready = false;

if (process.env.REDIS_URL) {
  try {
    const IORedis = require("ioredis");
    client = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    client.on("connect", () => { ready = true; logger.info("Redis connected"); });
    client.on("error", (err) => { ready = false; logger.warn({ err }, "Redis error"); });

    client.connect().catch((err) => logger.warn({ err }, "Redis initial connect failed"));
  } catch (err) {
    logger.warn({ err }, "ioredis not available — Redis disabled");
  }
}

/** Get a cached value (returns null if Redis is unavailable or key is missing). */
async function get(key) {
  if (!client || !ready) return null;
  try {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/** Set a value with optional TTL in seconds (default: 60s). */
async function set(key, value, ttl = 60) {
  if (!client || !ready) return;
  try {
    await client.set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    /* silent */
  }
}

/** Delete a key. */
async function del(key) {
  if (!client || !ready) return;
  try { await client.del(key); } catch { /* silent */ }
}

/** Invalidate all keys matching a glob pattern (use sparingly). */
async function invalidatePattern(pattern) {
  if (!client || !ready) return;
  try {
    const keys = await client.keys(pattern);
    if (keys.length) await client.del(...keys);
  } catch { /* silent */ }
}

module.exports = { get, set, del, invalidatePattern, client: () => client };
