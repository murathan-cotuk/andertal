# Andertal - E-commerce Marketplace Monorepo

A complete e-commerce marketplace platform built with Turborepo, featuring a customer-facing shop, seller dashboard with integrated platform admin, and Medusa v2 backend.

## 🏗️ Project Structure

```
andertal/
├── apps/
│   ├── shop/              # Customer-facing Next.js 14 store
│   ├── sellercentral/     # Seller dashboard + Platform Admin (Next.js 14)
│   └── medusa-backend/    # Medusa v2 backend (REST API)
├── packages/
│   ├── ui/                # Shared design system components
│   ├── lib/               # Shared utilities (Stripe, SEO)
│   └── config/           # Shared configs (Tailwind, ESLint, TypeScript)
└── turbo.json             # Turborepo configuration
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL database (local or cloud) or SQLite for development
- Stripe account for payments (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/murathan-cotuk/andertal.git
   cd andertal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   **`apps/medusa-backend/.env.local`**
   ```env
   DATABASE_URL=postgres://user:password@localhost:5432/medusa-db
   # Or for SQLite (development):
   # DATABASE_URL=file:./medusa.db
   # DATABASE_TYPE=sqlite
   
   PORT=9000
   STORE_CORS=http://localhost:3000
   ADMIN_CORS=http://localhost:3002
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-jwt-secret
   COOKIE_SECRET=your-cookie-secret
   ```

   **`apps/shop/.env.local`**
   ```env
   NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
   ```

   **`apps/sellercentral/.env.local`**
   ```env
   NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
   ```

4. **Set up database**

   - For PostgreSQL: Create a database and update `DATABASE_URL`
   - For SQLite: Database file will be created automatically

5. **Run migrations**

   **Linux/Mac:**
   ```bash
   cd apps/medusa-backend
   npx medusa migrations run
   ```

   **Windows PowerShell:**
   ```powershell
   cd apps/medusa-backend
   npx medusa migrations run
   ```

   **⚠️ Migration Hatası Durumunda:**
   
   Eğer `npx medusa migrations run` hata verirse (ör. `ERR_INVALID_ARG_TYPE`), migration'ları manuel çalıştırın:
   
   **Alternatif 1: Script ile (TypeORM)**
   ```bash
   cd apps/medusa-backend
   npm run run-migrations
   ```
   
   **Alternatif 2: SQL ile (PostgreSQL)**
   ```sql
   ALTER TABLE admin_hub_categories
   ADD COLUMN IF NOT EXISTS is_visible boolean DEFAULT true,
   ADD COLUMN IF NOT EXISTS has_collection boolean DEFAULT false,
   ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
   ```
   
   **Not:** Medusa v2 bazen kendi ORM'ini kullandığı için TypeORM migration script'i uyumlu olmayabilir. O durumda SQL ile manuel ekleme yapın.

6. **Start the backend**

   **Linux/Mac:**
   ```bash
   cd apps/medusa-backend
   node server.js
   # Or: npx medusa develop
   ```

   **Windows PowerShell:**
   ```powershell
   cd apps/medusa-backend
   node server.js
   # Or: npx medusa develop
   ```
   
   **Not:** PowerShell'de `&&` çalışmaz, komutları ayrı satırlarda çalıştırın veya `;` kullanın.

## 🛠️ Development

### Run all apps in development mode

```bash
npm run dev
```

This will start:
- **Medusa Backend**: http://localhost:9000 (Admin UI: http://localhost:9000/admin-ui)
- **Shop app**: http://localhost:3000
- **Sellercentral app**: http://localhost:3002 (includes Platform Admin features)

### Run individual apps

**IMPORTANT:** Always start the backend first:

```bash
# 1. Start Medusa backend first
cd apps/medusa-backend
node server.js

# 2. Then start frontend apps (in separate terminals)
cd apps/shop
npm run dev

cd apps/sellercentral
npm run dev
```

### Build all apps

```bash
npm run build
```

### Lint all apps

```bash
npm run lint
```

## 📱 Applications

### 🛍️ Shop (`apps/shop`)

Customer-facing e-commerce store.

**Features:**
- Product browsing and search
- Category navigation (from Admin Hub)
- Collection pages (`/collections/:slug`)
- Shopping cart
- User authentication

**Tech Stack:**
- Next.js 14 (App Router)
- React 19
- Tailwind CSS
- Medusa REST API client

### 🏪 SellerCentral (`apps/sellercentral`)

Seller dashboard with integrated platform admin features.

**Features:**
- Product management (create, update, delete)
- Order management
- Inventory tracking
- Analytics dashboard
- **Platform Admin:**
  - Category management (Settings → Categories)
  - Banner management (Settings → Banners)
  - Platform settings (Settings → Platform)

**Tech Stack:**
- Next.js 14 (App Router)
- React 19
- Tailwind CSS + Styled Components
- Medusa REST API client

**Access Platform Admin:**
- Navigate to: Settings → Categories / Banners / Platform
- Uses Admin Hub API (`/admin-hub/v1/*`)

### 🎛️ Platform Admin (SellerCentral)

Platform admin features are integrated into SellerCentral under Settings menu.

**Features:**
- Category management (Settings → Categories)
- Banner management (Settings → Banners)
- Platform settings (Settings → Platform)
- Global metadata management

**Access:**
- SellerCentral → Settings → Categories/Banners/Platform
- Uses Admin Hub API (`/admin-hub/v1/*`)

### 🔧 Medusa Backend (`apps/medusa-backend`)

Medusa v2 backend with REST API.

**Features:**
- Product management (Medusa core)
- Custom Admin Hub entities (Categories, Banners)
- Region/Market support
- Collection management
- Store and Admin API endpoints

**Tech Stack:**
- Medusa v2
- TypeORM
- PostgreSQL or SQLite

**Admin UI:**
- Access at: http://localhost:9000/admin-ui
- Shopify-like interface for monitoring backend status and API endpoints

## 📊 API Endpoints

### Store API (`/store/*`)
- `GET /store/products` - List products (with filters: `region`, `category`, `collection_id`)

### Admin API (`/admin/*`)
- `GET /admin/products` - List products
- `POST /admin/products` - Create product
- `GET /admin/regions` - List regions
- `POST /admin/regions` - Create region
- `GET /admin/product-categories` - List categories (DEPRECATED - read-only)

### Admin Hub API v1 (`/admin-hub/v1/*`)
- `GET /admin-hub/v1/categories` - List categories (with `tree=true`, `is_visible=true` filters)
- `POST /admin-hub/v1/categories` - Create category
- `PUT /admin-hub/v1/categories/:id` - Update category
- `DELETE /admin-hub/v1/categories/:id` - Delete category
- `GET /admin-hub/v1/banners` - List banners
- `POST /admin-hub/v1/banners` - Create banner
- `PUT /admin-hub/v1/banners/:id` - Update banner
- `DELETE /admin-hub/v1/banners/:id` - Delete banner

## 🗄️ Database Schema

Medusa v2 uses TypeORM for database management. Key entities:

**Medusa Core:**
- `product` - Products
- `product_collection` - Collections
- `product_category` - Product categories (DEPRECATED - use Admin Hub)
- `region` - Regions (Medusa core)
- `order` - Orders

**Custom Entities (Admin Hub):**
- `admin_hub_categories` - Platform categories (with `has_collection`, `is_visible`)
- `admin_hub_banners` - Platform banners

**Custom Entities (Region/Market):**
- `regions` - Custom regions (market visibility)
- `product_regions` - Product-region junction table

## 🔐 Security

- Never commit `.env` files
- Use environment variables for all secrets
- Enable CORS properly in production
- Validate all user inputs
- Use HTTPS in production
- Secure PostgreSQL connection with SSL (production)

## 📝 Environment Variables for Production

**Medusa Backend:**
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 9000)
- `STORE_CORS` - Shop app URL
- `ADMIN_CORS` - Sellercentral URLs (platform admin features are integrated)
- `REDIS_URL` - Redis connection string (optional)
- `JWT_SECRET` - JWT secret key
- `COOKIE_SECRET` - Cookie secret key

**Frontend Apps:**
- `NEXT_PUBLIC_MEDUSA_BACKEND_URL` - Medusa backend URL (e.g., `https://your-backend.onrender.com`)

## 🚀 Deployment

### Backend (Render)

1. Connect your GitHub repository
2. Set root directory: `apps/medusa-backend`
3. Set build command: `npm install`
4. Set start command: `node server.js`
5. Add environment variables (see above)

### Frontend Apps (Vercel)

1. Connect your GitHub repository
2. Set root directory: `apps/shop` (or `apps/sellercentral`)
3. Set build command: `cd ../.. && npm install && npm run build --filter=@andertal/shop` (adjust filter)
4. Add environment variables (see above)

## 📚 Documentation

- `docs/TASKS.md` - Current tasks and to-do list
- `docs/RAPOR.md` - Project status report
- `docs/PROJE.md` - Architecture and project structure

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

Copyright (c) 2026 Andertal. All rights reserved.
