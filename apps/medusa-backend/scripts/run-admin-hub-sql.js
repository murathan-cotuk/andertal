/**
 * Admin Hub tablolarini PostgreSQL'e SQL ile kurar. TypeORM/ESM gerektirmez.
 * PowerShell: $env:DATABASE_URL="postgresql://..."; node apps/medusa-backend/scripts/run-admin-hub-sql.js
 */
require('dotenv').config()
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') }) } catch (_) {}

const { Client } = require('pg')
const path = require('path')

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/medusa'

const SQL_STEPS = [
  { name: 'uuid extension', sql: 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' },
  {
    name: 'admin_hub_categories',
    sql: `
      CREATE TABLE IF NOT EXISTS admin_hub_categories (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(255) NOT NULL,
        slug varchar(255) NOT NULL UNIQUE,
        description text,
        parent_id uuid REFERENCES admin_hub_categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
        active boolean DEFAULT true,
        sort_order integer DEFAULT 0,
        is_visible boolean DEFAULT true,
        has_collection boolean DEFAULT false,
        seo_title varchar(255),
        seo_description text,
        long_content text,
        banner_image_url text,
        metadata jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_hub_categories_slug ON admin_hub_categories(slug);
      CREATE INDEX IF NOT EXISTS idx_admin_hub_categories_parent_id ON admin_hub_categories(parent_id);
    `,
  },
  {
    name: 'admin_hub_banners',
    sql: `
      CREATE TABLE IF NOT EXISTS admin_hub_banners (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        title varchar(255) NOT NULL,
        image_url text NOT NULL,
        link text,
        position varchar(50) DEFAULT 'home',
        active boolean DEFAULT true,
        sort_order integer DEFAULT 0,
        start_date timestamp,
        end_date timestamp,
        metadata jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_hub_banners_active ON admin_hub_banners(active);
    `,
  },
  {
    name: 'admin_hub_menus',
    sql: `
      CREATE TABLE IF NOT EXISTS admin_hub_menus (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(100) NOT NULL,
        slug varchar(100) NOT NULL UNIQUE,
        location varchar(50) DEFAULT 'main',
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_hub_menus_slug ON admin_hub_menus(slug);
      CREATE INDEX IF NOT EXISTS idx_admin_hub_menus_location ON admin_hub_menus(location);
    `,
  },
  {
    name: 'admin_hub_menu_items',
    sql: `
      CREATE TABLE IF NOT EXISTS admin_hub_menu_items (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        menu_id uuid NOT NULL REFERENCES admin_hub_menus(id) ON DELETE CASCADE,
        label varchar(255) NOT NULL,
        link_type varchar(50) DEFAULT 'url',
        link_value text,
        parent_id uuid REFERENCES admin_hub_menu_items(id) ON DELETE CASCADE,
        sort_order integer DEFAULT 0,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_hub_menu_items_menu_id ON admin_hub_menu_items(menu_id);
      CREATE INDEX IF NOT EXISTS idx_admin_hub_menu_items_parent_id ON admin_hub_menu_items(parent_id);
    `,
  },
]

async function main() {
  const url = DATABASE_URL.replace(/^postgresql:\/\//, 'postgres://')
  const isRender = url.includes('render.com')
  const client = new Client({
    connectionString: url,
    ssl: isRender ? { rejectUnauthorized: false } : false,
  })

  console.log('\nAdmin Hub SQL migration (pg only, no TypeORM)\n')
  console.log('DB:', url.replace(/:[^:@]+@/, ':****@'))

  try {
    await client.connect()
    for (const step of SQL_STEPS) {
      await client.query(step.sql)
      console.log('OK:', step.name)
    }
    console.log('\nBitti. admin_hub_categories, admin_hub_banners, admin_hub_menus, admin_hub_menu_items hazir.\n')
  } catch (err) {
    console.error('\nHata:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
