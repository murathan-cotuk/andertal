import dotenv from 'dotenv'
import express from 'express'
import payload from 'payload'
import config from './payload.config.js'
import path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Load .env.local file (try multiple paths)
const envPaths = [
  path.resolve(dirname, '../.env.local'),
  path.resolve(dirname, '../../.env.local'),
  path.resolve(process.cwd(), '.env.local'),
]

for (const envPath of envPaths) {
  dotenv.config({ path: envPath, override: false })
}
dotenv.config() // Also load .env if exists

// Debug: Log if secret is loaded
if (!process.env.PAYLOAD_SECRET) {
  console.error('⚠️  PAYLOAD_SECRET not found! Checked paths:', envPaths)
}

const app = express()

// Redirect root to admin
app.get('/', (_, res) => {
  res.redirect('/admin')
})

const start = async () => {
  // Initialize Payload
  await payload.init({
    secret: process.env.PAYLOAD_SECRET || 'your-secret-key',
    express: app,
    config,
    onInit: async () => {
      payload.logger.info(`Payload Admin URL: ${payload.getAdminURL()}`)
      payload.logger.info(`GraphQL API: ${payload.getAdminURL()}/api/graphql`)
    },
  })

  // Add your own express routes here

  const port = process.env.PORT || 3001

  app.listen(port, () => {
    payload.logger.info(`Server listening on port ${port}`)
  })
}

start()
