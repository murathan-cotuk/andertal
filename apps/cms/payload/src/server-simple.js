import express from 'express'
import payload from 'payload'
import dotenv from 'dotenv'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import config from './payload.config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const app = express()

// CORS
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:7001', // Medusa admin
    'http://localhost:8000', // Medusa shop
  ],
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'payload-cms' })
})

const start = async () => {
  try {
    // Init Payload
    await payload.init({
      secret: process.env.PAYLOAD_SECRET,
      express: app,
      config,
      onInit: async () => {
        console.log('✅ Payload CMS initialized')
      },
    })

    const port = process.env.PORT || 3001
    
    app.listen(port, () => {
      console.log('')
      console.log('═══════════════════════════════════════')
      console.log('  Payload CMS (Standalone)')
      console.log('═══════════════════════════════════════')
      console.log(`  Port:     ${port}`)
      console.log(`  Admin:    http://localhost:${port}/admin`)
      console.log(`  GraphQL:  http://localhost:${port}/api/graphql`)
      console.log(`  Health:   http://localhost:${port}/health`)
      console.log('═══════════════════════════════════════')
      console.log('')
    })
  } catch (error) {
    console.error('❌ Payload initialization failed:', error)
    console.error('Error stack:', error.stack)
    process.exit(1)
  }
}

start()
