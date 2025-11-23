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

// Load environment variables
let envLoaded = false
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath, override: false })
  if (!result.error) {
    envLoaded = true
    console.log(`✅ Loaded .env from: ${envPath}`)
  }
}
dotenv.config() // Also load .env if exists

// Ensure PAYLOAD_SECRET is set
const secret = process.env.PAYLOAD_SECRET || 'beluchaSecret123'
if (!process.env.PAYLOAD_SECRET) {
  console.warn('⚠️  PAYLOAD_SECRET not found in env, using default')
  process.env.PAYLOAD_SECRET = secret
} else {
  console.log('✅ PAYLOAD_SECRET loaded:', process.env.PAYLOAD_SECRET.substring(0, 10) + '...')
}

const app = express()

// Redirect root to admin
app.get('/', (_, res) => {
  res.redirect('/admin')
})

const start = async () => {
  // Ensure secret is set - PayloadCMS v3 requires secret in both config and init
  const secretKey = process.env.PAYLOAD_SECRET || 'beluchaSecret123'
  
  // Set it in process.env to ensure config can read it
  process.env.PAYLOAD_SECRET = secretKey
  
  console.log('🔑 Secret key set:', secretKey ? secretKey.substring(0, 15) + '...' : 'NOT FOUND!')
  console.log('🔑 Process.env.PAYLOAD_SECRET:', process.env.PAYLOAD_SECRET ? 'SET' : 'NOT SET')
  
  // Initialize Payload - secret is also in config
  await payload.init({
    secret: secretKey,
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
