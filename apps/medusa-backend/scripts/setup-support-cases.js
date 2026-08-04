'use strict'

require('dotenv').config()
const { Client } = require('pg')
const { initializeSupportCaseSchema } = require('../src/support-case-schema')

async function main() {
  const dbUrl = String(process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl.startsWith('postgres')) throw new Error('DATABASE_URL is not configured')
  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  try {
    await initializeSupportCaseSchema(client)
    console.log('Support-case schema is ready.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exitCode = 1
})
