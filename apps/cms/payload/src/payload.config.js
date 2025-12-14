import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
 
// Load env before config - try root first, then payload directory
const configDirname = path.dirname(fileURLToPath(import.meta.url))
const envPaths = [
  path.resolve(configDirname, '../../../../.env.local'), // Root: belucha/.env.local
  path.resolve(configDirname, '../../../.env.local'),   // Root: belucha/.env.local (alternative)
  path.resolve(process.cwd(), '.env.local'),             // Current working directory
  path.resolve(configDirname, '../.env.local'),          // Payload directory: apps/cms/payload/.env.local
]

// Try to load from root first, then fallback to payload directory
let envLoaded = false
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath, override: false })
  if (!result.error) {
    envLoaded = true
    break // Stop after first successful load
  }
}
dotenv.config() // Also load .env if exists

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

import Products from './collections/Products.js'
import Categories from './collections/Categories.js'
import Brands from './collections/Brands.js'
import Sellers from './collections/Sellers.js'
import Customers from './collections/Customers.js'
import Orders from './collections/Orders.js'
import Media from './collections/Media.js'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'beluchaSecret123456789012345678901234567890',
  admin: {
    user: 'sellers',
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
    url: process.env.PAYLOAD_MONGO_URL || process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/belucha',
  }),
  graphQL: {
    schemaOutputFile: path.resolve(dirname, 'generated-schema.graphql'),
  },
  plugins: [],
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3001',
  cors: [
    'http://localhost:3000',
    'http://localhost:3002',
    'https://belucha-shop.vercel.app',
    'https://belucha-sellercentral.vercel.app',
    'https://sellercentral.vercel.app',
  ],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
