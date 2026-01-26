import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

// Collections
import { Products } from './payload/collections/Products'
import { Categories } from './payload/collections/Categories'
import { Brands } from './payload/collections/Brands'
import { Sellers } from './payload/collections/Sellers'
import { Customers } from './payload/collections/Customers'
import { Orders } from './payload/collections/Orders'
import { Media } from './payload/collections/Media'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Check required env vars
const mongoUrl = process.env.PAYLOAD_MONGO_URL || process.env.DATABASE_URI
if (!mongoUrl) throw new Error('Database URL is required. Set PAYLOAD_MONGO_URL or DATABASE_URI')

if (!process.env.PAYLOAD_SECRET) throw new Error('PAYLOAD_SECRET is required')

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET,
  admin: {
    user: 'sellers',
    path: '/admin',
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
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL_OVERRIDE || 
             process.env.PAYLOAD_PUBLIC_SERVER_URL || 
             'http://localhost:3000',
  cors: [
    'http://localhost:3000',
    'http://localhost:3002',
    'https://belucha-shop.vercel.app',
    'https://belucha-sellercentral.vercel.app',
    'https://sellercentral.vercel.app',
  ],
})
