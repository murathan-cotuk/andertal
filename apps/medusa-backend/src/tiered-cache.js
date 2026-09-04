'use strict'

const redis = require('./redis')

/**
 * Redis-backed cache with an in-memory Map fallback, namespaced per call site.
 * Reads try Redis first (shared across instances) and fall back to the local Map
 * so a single instance still benefits from a TTL cache in dev or when Redis is
 * briefly unreachable. Writes go to both so the local fallback stays warm.
 */
function createTieredCache(namespace, defaultTtlSeconds = 60) {
  const mem = new Map() // key -> { value, expiresAt }
  const nsKey = (key) => `${namespace}:${key}`

  async function get(key) {
    const k = nsKey(key)
    const fromRedis = await redis.get(k)
    if (fromRedis !== null) return fromRedis
    const local = mem.get(k)
    if (local && local.expiresAt > Date.now()) return local.value
    if (local) mem.delete(k)
    return null
  }

  async function set(key, value, ttlSeconds = defaultTtlSeconds) {
    const k = nsKey(key)
    mem.set(k, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
    await redis.set(k, value, ttlSeconds)
  }

  async function invalidateAll() {
    mem.clear()
    await redis.invalidatePattern(`${namespace}:*`)
  }

  return { get, set, invalidateAll }
}

module.exports = { createTieredCache }
