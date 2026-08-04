'use strict'

const fs = require('fs')
const path = require('path')

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003_support_cases.sql'), 'utf8')

async function initializeSupportCaseSchema(client) {
  await client.query(schemaSql)
}

async function archiveEligibleSupportCases(client, days = Number(process.env.SUPPORT_CUSTOMER_ARCHIVE_DAYS || 30)) {
  const safeDays = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 30
  await client.query('BEGIN')
  try {
    const result = await client.query(
      `WITH archived AS (
         UPDATE support_cases
            SET customer_hidden_at = now(), updated_at = now()
          WHERE customer_hidden_at IS NULL
            AND status IN ('closed', 'resolved')
            AND COALESCE(auto_archive_at, closed_at + ($1::int * interval '1 day')) <= now()
          RETURNING id
       )
       INSERT INTO support_case_events (case_id, event_type, actor_role, actor_id, data, dedupe_key)
       SELECT id, 'case_auto_archived', 'system', 'archive-job', '{}'::jsonb, 'auto_archive:' || id::text
         FROM archived
       ON CONFLICT (case_id, dedupe_key) DO NOTHING
       RETURNING case_id AS id`,
      [safeDays],
    )
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

// Deliberately read-only: an authenticated, audited admin purge workflow can use this
// candidate list later, but this backend never hard-deletes support data automatically.
async function listRetentionPurgeCandidates(client, days = Number(process.env.SUPPORT_RETENTION_DAYS || 730), limit = 100) {
  const safeDays = Number.isFinite(days) && days >= 30 ? Math.floor(days) : 730
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 1000) : 100
  return client.query(
    `SELECT id, case_number, closed_at
       FROM support_cases
      WHERE legal_hold = false
        AND status IN ('closed', 'resolved')
        AND closed_at < now() - ($1::int * interval '1 day')
      ORDER BY closed_at
      LIMIT $2`,
    [safeDays, safeLimit],
  )
}

function startSupportArchiveJob() {
  const { getPool } = require('./db-pool')
  const run = async () => {
    const pool = getPool()
    if (!pool) return
    const client = await pool.connect()
    try {
      const result = await archiveEligibleSupportCases(client)
      if (result.rowCount) console.info(`[support-cases] soft-archived ${result.rowCount} customer cases`)
    } catch (error) {
      console.warn('[support-cases] archive job failed:', error?.message || error)
    } finally {
      client.release()
    }
  }
  const timer = setInterval(run, 6 * 60 * 60 * 1000)
  timer.unref?.()
  setImmediate(run)
  return timer
}

module.exports = {
  initializeSupportCaseSchema,
  archiveEligibleSupportCases,
  listRetentionPurgeCandidates,
  startSupportArchiveJob,
}
