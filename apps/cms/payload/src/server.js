import dotenv from 'dotenv'
import express from 'express'
import payload from 'payload'
import config from './payload.config.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Load .env.local file (try multiple paths - mutlak path kullanarak Cursor'un globalignore sorununu aşıyoruz)
const envPaths = [
  path.resolve(dirname, '../.env.local'),          // Payload directory: apps/cms/payload/.env.local (ÖNCELİK)
  path.resolve(dirname, '../../../../.env.local'), // Root: belucha/.env.local
  path.resolve(dirname, '../../../.env.local'),    // Root: belucha/.env.local (alternative)
  path.resolve(process.cwd(), '.env.local'),       // Current working directory
]

// Load environment variables with explicit path resolution
let envLoaded = false
let loadedPath = null

for (const envPath of envPaths) {
  try {
    // Dosyanın gerçekten var olup olmadığını kontrol et
    if (existsSync(envPath)) {
      const result = dotenv.config({ path: envPath, override: false })
      if (!result.error) {
        envLoaded = true
        loadedPath = envPath
        console.log(`✅ Loaded .env from: ${envPath}`)
        break // İlk başarılı yüklemede dur
      }
    }
  } catch (error) {
    // Devam et, diğer path'leri dene
    continue
  }
}

// Eğer hiçbir path'ten yüklenemediyse, .env dosyasını dene
if (!envLoaded) {
  dotenv.config() // Also load .env if exists
  if (process.env.PAYLOAD_SECRET) {
    console.log(`✅ Loaded .env from default location`)
    envLoaded = true
  }
}

// Eğer hala yüklenemediyse uyarı ver
if (!envLoaded) {
  console.warn('⚠️  No .env.local file found in any of the expected locations')
  console.warn('   Expected locations:')
  envPaths.forEach(p => console.warn(`   - ${p}`))
}

// Ensure PAYLOAD_SECRET is set
const secret = process.env.PAYLOAD_SECRET || 'beluchaSecret123456789012345678901234567890'
if (!process.env.PAYLOAD_SECRET) {
  console.warn('⚠️  PAYLOAD_SECRET not found in env, using default')
  process.env.PAYLOAD_SECRET = secret
} else {
  console.log('✅ PAYLOAD_SECRET loaded:', process.env.PAYLOAD_SECRET.substring(0, 10) + '...')
}

const app = express()

// Essential Express middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const start = async () => {
  // Ensure secret is set - PayloadCMS v3 requires secret in both config and init
  const secretKey = process.env.PAYLOAD_SECRET || 'beluchaSecret123456789012345678901234567890'
  
  // Set it in process.env to ensure config can read it
  process.env.PAYLOAD_SECRET = secretKey
  
  console.log('🔑 Secret key set:', secretKey ? secretKey.substring(0, 15) + '...' : 'NOT FOUND!')
  console.log('🔑 Process.env.PAYLOAD_SECRET:', process.env.PAYLOAD_SECRET ? 'SET' : 'NOT SET')
  
  try {
    // Initialize Payload - secret is also in config
    // Payload.init() will automatically register all routes (/admin, /api, /api/graphql)
    await payload.init({
      secret: secretKey,
      express: app,
      config,
      onInit: async () => {
        payload.logger.info(`Payload Admin URL: ${payload.getAdminURL()}`)
        payload.logger.info(`GraphQL API: ${process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3001'}/api/graphql`)
        console.log('✅ MongoDB connection established')
        console.log('✅ Payload CMS initialized successfully')
        console.log('✅ Routes registered: /admin, /api, /api/graphql')
      },
    })

    // Add your own express routes here (after Payload init)
    // Redirect root to admin (after Payload routes are registered)
    app.get('/', (_, res) => {
      res.redirect('/admin')
    })

    // Debug: List all registered routes
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n📋 Registered routes:')
      app._router?.stack?.forEach((middleware) => {
        if (middleware.route) {
          console.log(`   ${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`)
        } else if (middleware.name === 'router') {
          console.log(`   Router: ${middleware.regexp}`)
        }
      })
      console.log('')
    }

    const port = process.env.PORT || 3001

    // Try to start server, if port is in use, provide clear instructions
    let server
    try {
      server = app.listen(port, () => {
        payload.logger.info(`Server listening on port ${port}`)
        console.log(`✅ Server running at http://localhost:${port}`)
        console.log(`✅ Admin Panel: http://localhost:${port}/admin`)
        console.log(`✅ GraphQL API: http://localhost:${port}/api/graphql`)
      })

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`\n❌ Port ${port} is already in use.`)
          console.error(`\n🔧 Hızlı Çözüm:`)
          console.error(`   PowerShell'de şu komutu çalıştırın:`)
          console.error(`   Get-NetTCPConnection -LocalPort ${port} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`)
          console.error(`\n   Veya manuel:`)
          console.error(`   netstat -ano | findstr :${port}`)
          console.error(`   taskkill /F /PID <PID_NUMBER>`)
          console.error(`\n   Veya farklı port kullanın (.env.local): PORT=3002\n`)
          process.exit(1)
        } else {
          throw error
        }
      })
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${port} is already in use.`)
        console.error(`\n🔧 Hızlı Çözüm:`)
        console.error(`   PowerShell'de şu komutu çalıştırın:`)
        console.error(`   Get-NetTCPConnection -LocalPort ${port} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`)
        console.error(`\n   Veya manuel:`)
        console.error(`   netstat -ano | findstr :${port}`)
        console.error(`   taskkill /F /PID <PID_NUMBER>`)
        console.error(`\n   Veya farklı port kullanın (.env.local): PORT=3002\n`)
        process.exit(1)
      } else {
        throw error
      }
    }
  } catch (error) {
    console.error('❌ Error initializing Payload CMS:', error)
    process.exit(1)
  }
}

start()
