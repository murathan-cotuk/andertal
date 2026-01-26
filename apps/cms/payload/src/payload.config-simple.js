import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Check required env vars
const mongoUrl = process.env.PAYLOAD_MONGO_URL || process.env.DATABASE_URI
if (!mongoUrl) throw new Error('Database URL is required. Set PAYLOAD_MONGO_URL or DATABASE_URI')

if (!process.env.PAYLOAD_SECRET) throw new Error('PAYLOAD_SECRET is required')

// BASIT CONFIG - Sadece Sellers collection
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
    {
      slug: 'sellers',
      auth: true,
      admin: {
        useAsTitle: 'storeName',
      },
      fields: [
        {
          name: 'storeName',
          type: 'text',
          required: true,
        },
        {
          name: 'email',
          type: 'email',
          required: true,
          unique: true,
        },
        {
          name: 'phone',
          type: 'text',
        },
        {
          name: 'address',
          type: 'textarea',
        },
        {
          name: 'verified',
          type: 'checkbox',
          defaultValue: false,
        },
        {
          name: 'commissionRate',
          type: 'number',
          defaultValue: 10,
          admin: {
            description: 'Commission rate in percentage (e.g., 10 = 10%)',
          },
        },
      ],
    },
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
  
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3001',
  
  cors: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:7001',
    'http://localhost:8000',
  ],
})
