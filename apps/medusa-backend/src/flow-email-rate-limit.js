/**
 * In-process sliding window rate limit for flow email sends (per scope key, e.g. seller_id).
 * Env: FLOW_EMAIL_MAX_PER_MINUTE (default 180), set 0 to disable.
 */

const buckets = new Map()

function maxPerMinute() {
  const n = parseInt(String(process.env.FLOW_EMAIL_MAX_PER_MINUTE || '180'), 10)
  if (Number.isNaN(n) || n < 0) return 180
  return n
}

function pruneBucket(b, now, windowMs) {
  const cutoff = now - windowMs
  while (b.timestamps.length && b.timestamps[0] < cutoff) b.timestamps.shift()
}

/**
 * @param {string} scopeKey
 * @throws {Error} code RATE_LIMITED
 */
function consumeFlowEmailSlot(scopeKey) {
  const cap = maxPerMinute()
  if (!cap) return
  const k = String(scopeKey || 'default').trim() || 'default'
  const windowMs = 60_000
  const now = Date.now()
  let b = buckets.get(k)
  if (!b) {
    b = { timestamps: [] }
    buckets.set(k, b)
  }
  pruneBucket(b, now, windowMs)
  if (b.timestamps.length >= cap) {
    const err = new Error(`flow_email_rate_limit_exceeded scope=${k} max_per_minute=${cap}`)
    err.code = 'RATE_LIMITED'
    throw err
  }
  b.timestamps.push(now)
}

module.exports = { consumeFlowEmailSlot, maxPerMinute }
