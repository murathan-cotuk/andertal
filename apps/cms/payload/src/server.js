import express from 'express'
import payload from 'payload'
import config from './payload.config.js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment
const envPath = path.resolve(__dirname, '../.env.local')
console.log('[1/7] Loading environment from:', envPath)
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
  console.log('✅ [1/7] Environment loaded')
} else {
  console.log('⚠️ [1/7] .env.local not found, using process.env')
}

// Validate critical env vars
console.log('[2/7] Validating environment variables...')
const requiredEnvVars = ['PAYLOAD_SECRET', 'DATABASE_URI', 'PAYLOAD_PUBLIC_SERVER_URL']
const missingVars = requiredEnvVars.filter(v => !process.env[v])
if (missingVars.length > 0) {
  console.error('❌ [2/7] Missing environment variables:', missingVars)
  process.exit(1)
}
console.log('✅ [2/7] All required env vars present')

// Create Express app
console.log('[3/7] Creating Express app...')
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin
  const allowed = [
    'http://localhost:3000',
    'http://localhost:3002',
    'https://belucha-shop.vercel.app',
    'https://belucha-sellercentral.vercel.app',
  ]
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

console.log('✅ [3/7] Express app created')

// Health endpoint (before Payload init)
console.log('[4/7] Registering health endpoint...')
app.get('/health', (req, res) => {
  res.json({ status: 'ok', payload: 'initialized' })
})
console.log('✅ [4/7] Health endpoint registered at /health')

// Start server
const start = async () => {
  console.log('[5/7] Starting Payload initialization...')
  console.log('      - Secret:', process.env.PAYLOAD_SECRET.substring(0, 20) + '...')
  console.log('      - Database:', (process.env.PAYLOAD_MONGO_URL || process.env.DATABASE_URI || '').substring(0, 50) + '...')
  console.log('      - Server URL:', process.env.PAYLOAD_PUBLIC_SERVER_URL)

  try {
    // Initialize Payload
    const payloadInstance = await payload.init({
      secret: process.env.PAYLOAD_SECRET,
      express: app,
      config,
      onInit: async (payload) => {
        console.log('✅ [5/7] Payload.init() callback executed')
        console.log('      - Payload version:', payload.version || 'unknown')
        
        // Check if Payload registered routes
        console.log('[6/7] Checking Payload route registration...')
        
        // Method 1: Check app._router.stack
        const expressRoutes = []
        if (app._router && app._router.stack) {
          app._router.stack.forEach((layer) => {
            if (layer.route) {
              const methods = Object.keys(layer.route.methods).join(',').toUpperCase()
              expressRoutes.push(`${methods} ${layer.route.path}`)
            } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
              layer.handle.stack.forEach((subLayer) => {
                if (subLayer.route) {
                  const methods = Object.keys(subLayer.route.methods).join(',').toUpperCase()
                  const path = layer.regexp ? layer.regexp.source.replace(/\\\//g, '/').replace(/[^a-zA-Z0-9/]/g, '') : ''
                  expressRoutes.push(`${methods} ${path}${subLayer.route.path}`)
                }
              })
            }
          })
        }
        
        console.log('      - Total Express routes:', expressRoutes.length)
        expressRoutes.forEach(route => console.log('        -', route))
        
        // Method 2: Check Payload internal router
        console.log('      - Payload router exists:', !!payload.router)
        console.log('      - Payload config.routes:', JSON.stringify(payload.config?.routes || {}))
        
        // Method 3: Check specific endpoints manually
        console.log('[6/7] Manually testing internal routes...')
        const testRoutes = ['/api/graphql', '/admin', '/api']
        for (const route of testRoutes) {
          const found = expressRoutes.some(r => r.includes(route))
          console.log(`      - ${route}: ${found ? '✅ FOUND' : '❌ NOT FOUND'}`)
        }
        
        console.log('✅ [6/7] Route registration check complete')
      },
    })

    console.log('[7/7] Starting HTTP server...')
    const port = process.env.PORT || 3001
    app.listen(port, '0.0.0.0', () => {
      console.log('✅ [7/7] Server started successfully')
      console.log('')
      console.log('═══════════════════════════════════════')
      console.log('  Payload CMS Server')
      console.log('═══════════════════════════════════════')
      console.log(`  Port:     ${port}`)
      console.log(`  Health:   http://localhost:${port}/health`)
      console.log(`  Admin:    http://localhost:${port}/admin`)
      console.log(`  GraphQL:  http://localhost:${port}/api/graphql`)
      console.log('═══════════════════════════════════════')
      console.log('')
    })
  } catch (error) {
    console.error('❌ [5/7] Payload initialization FAILED')
    console.error('Error:', error)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

start()
