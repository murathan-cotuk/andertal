import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import fs from 'fs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Load .env.local
const envPath = path.resolve(dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

// Collections
import Products from './collections/Products.js'
import Categories from './collections/Categories.js'
import Brands from './collections/Brands.js'
import Sellers from './collections/Sellers.js'
import Customers from './collections/Customers.js'
import Orders from './collections/Orders.js'
import Media from './collections/Media.js'

// Check required env vars
const mongoUrl = process.env.PAYLOAD_MONGO_URL || process.env.DATABASE_URI
if (!mongoUrl) throw new Error('Database URL is required. Set PAYLOAD_MONGO_URL or DATABASE_URI')

if (!process.env.PAYLOAD_SECRET) throw new Error('PAYLOAD_SECRET is required')

// Payload config
export default buildConfig({
  secret: process.env.PAYLOAD_SECRET,
  admin: {
    user: 'sellers', // Sellers collection'ında admin olacak
    path: '/admin', // Explicit admin path
  },
  routes: {
    admin: '/admin',
    api: '/api',
    graphQL: '/api/graphql',
  },
  collections: [
    Products,
    Categories,
    Brands,
    Sellers,
    Customers,
    Orders,
    Media,
  ],
  editor: lexicalEditor({}),
  db: mongooseAdapter({
    url: mongoUrl,
  }),
  graphQL: {
    schemaOutputFile: path.resolve(dirname, 'generated-schema.graphql'),
  },
  plugins: [],
  // Priority: 1. OVERRIDE (Railway production URL), 2. Auto-generated, 3. Localhost
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL_OVERRIDE || 
             process.env.PAYLOAD_PUBLIC_SERVER_URL || 
             'http://localhost:3001',
  cors: [
    'http://localhost:3000',
    'http://localhost:3002',
    'https://belucha-shop.vercel.app',
    'https://belucha-sellercentral.vercel.app',
    'https://sellercentral.vercel.app',
    'https://belucha-cms.railway.app',
    'https://beluchacms-production.up.railway.app',
  ],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
