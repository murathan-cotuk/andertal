'use strict'

/**
 * Shared Postgres connection pool (Görev 25).
 *
 * The rest of the backend opens a brand-new `pg.Client` (fresh TCP connection +
 * auth handshake) per request, per query helper — hundreds of call sites. Under
 * real traffic that's slow and doesn't scale, and was a likely contributor to a
 * previous OOM crash. Rewriting every call site is too large/risky to do in one
 * pass, so this module gives the highest-traffic paths (public product listing —
 * used by every shop page load) a low-risk way to opt in: `getPooledClient()`
 * returns an object with the exact same `connect()` / `query()` / `end()`
 * interface callers already use, so no query logic has to change — only the
 * factory function that creates the client.
 */

const { Pool } = require('pg')

let _pool = null

function getPool() {
  if (_pool) return _pool
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  _pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 20),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
  // Idle-client errors (e.g. connection dropped by the server) must not crash the process.
  _pool.on('error', (err) => {
    console.error('[db-pool] idle client error:', err?.message || err)
  })
  return _pool
}

/**
 * Drop-in replacement for `new Client({...})`. Existing call sites do:
 *   const client = getSomeDbClient(); await client.connect(); ... await client.end()
 * This keeps that exact shape — connect() checks a real connection out of the pool,
 * end() releases it back (reused by the next request) instead of destroying it.
 */
function getPooledClient() {
  const pool = getPool()
  if (!pool) return null
  let poolClient = null
  return {
    connect: async () => {
      poolClient = await pool.connect()
    },
    query: (...args) => {
      if (!poolClient) throw new Error('getPooledClient: connect() must be called before query()')
      return poolClient.query(...args)
    },
    end: async () => {
      if (poolClient) {
        poolClient.release()
        poolClient = null
      }
    },
  }
}

module.exports = { getPool, getPooledClient }
