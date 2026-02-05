# Belucha - E-commerce Marketplace Monorepo

A complete e-commerce marketplace platform built with Turborepo, featuring a customer-facing shop, seller dashboard, and Medusa v2 backend.

## 🏗️ Project Structure

```
belucha/
├── apps/
│   ├── shop/              # Customer-facing Next.js 14 store
│   ├── sellercentral/     # Seller dashboard Next.js 14 app
│   ├── admin/             # Super Admin Panel (Next.js 14)
│   └── medusa-backend/    # Medusa v2 backend (REST API)
├── packages/
│   ├── ui/                # Shared design system components
│   ├── lib/               # Shared utilities (Stripe, SEO)
│   └── config/            # Shared configs (Tailwind, ESLint, TypeScript)
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
   git clone https://github.com/murathan-cotuk/belucha.git
   cd belucha
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
   ADMIN_CORS=http://localhost:3002,http://localhost:7001
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

   **`apps/admin/.env.local`**
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
   ADD COLUMN IF NOT EXISTS has_collection boolean DEFAULT false;
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
- **Medusa Backend**: http://localhost:9000
- **Shop app**: http://localhost:3000
- **Sellercentral app**: http://localhost:3002
- **Admin Panel**: http://localhost:7001 (or configured port)

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

cd apps/admin
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

### Format code

```bash
npm run format
```

## 📦 Applications

### 🏪 Shop App (`apps/shop`)

Customer-facing e-commerce store built with Next.js 14 App Router.

**Features:**
- Product browsing and search
- Category navigation (from Admin Hub)
- Collection pages (`/collections/:slug`)
- Product detail pages
- Shopping cart (to be implemented)
- Checkout with Stripe (to be implemented)

**Tech Stack:**
- Next.js 14 (App Router)
- Tailwind CSS + Styled Components
- Medusa REST API client
- Aeonik font family

### 📦 Sellercentral App (`apps/sellercentral`)

Complete seller dashboard for managing products, orders, and analytics.

**Features:**
- Dashboard with statistics
- Inventory management
- Product management (create, update, delete)
- Collection assignment for products
- Categories view (read-only, from Admin Hub)
- Store settings
- Seller registration

**Tech Stack:**
- Next.js 14 (App Router)
- Tailwind CSS + Styled Components
- Medusa REST API client
- Shared UI components

### 🎛️ Admin Panel (`apps/admin`)

Super Admin Panel for platform owners to manage global data.

**Features:**
- Category management (create, update, delete)
- Collection sync (categories with `has_collection=true`)
- Banner management (to be implemented)
- Platform settings (to be implemented)

**Tech Stack:**
- Next.js 14 (App Router)
- Tailwind CSS + Styled Components
- Medusa REST API client

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
- Express.js

## 📚 Shared Packages

### `@belucha/ui`

Shared design system components:
- Button
- Input
- Card
- (Extendable for more components)

### `@belucha/lib`

Shared utilities and configurations:
- **Stripe**: Payment processing and commission calculations
- **SEO**: Meta tag generation helpers

### `@belucha/config`

Shared configurations:
- Tailwind CSS configs
- ESLint configs
- TypeScript configs

## 🔌 Integrations

### PostgreSQL / SQLite

Used for:
- Primary database (via Medusa v2)
- All data storage (products, orders, categories, regions, etc.)
- Medusa core entities + custom Admin Hub entities

### Medusa v2 REST API

All apps use Medusa REST API client to consume the backend:
- Store API (`/store/*`) - Public endpoints for shop
- Admin API (`/admin/*`) - Admin endpoints for sellercentral
- Admin Hub API (`/admin-hub/*`) - Super admin endpoints

### Stripe

Used for:
- Payment processing (to be implemented)
- Checkout sessions (to be implemented)
- Seller payouts (to be implemented)

## 🚢 Deployment

### Backend (Medusa)

Deploy to Render, Railway, or any Node.js hosting:

1. **Render Deployment**
   - Connect your GitHub repo
   - Set root directory to `apps/medusa-backend`
   - Build command: `npm install`
   - Start command: `node server.js`
   - Add environment variables (see below)

2. **Database**
   - Set up PostgreSQL (Render, Railway, or cloud provider)
   - Update `DATABASE_URL` in environment variables

### Frontend Apps (Vercel)

All Next.js apps can be deployed separately on Vercel:

1. **Shop App**
   - Root directory: `apps/shop`
   - Add `NEXT_PUBLIC_MEDUSA_BACKEND_URL`

2. **Sellercentral App**
   - Root directory: `apps/sellercentral`
   - Add `NEXT_PUBLIC_MEDUSA_BACKEND_URL`

3. **Admin Panel**
   - Root directory: `apps/admin`
   - Add `NEXT_PUBLIC_MEDUSA_BACKEND_URL`

### Environment Variables for Production

**Medusa Backend:**
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 9000)
- `STORE_CORS` - Shop app URL
- `ADMIN_CORS` - Sellercentral and Admin app URLs
- `REDIS_URL` - Redis connection string (optional)
- `JWT_SECRET` - JWT secret key
- `COOKIE_SECRET` - Cookie secret key

**Frontend Apps:**
- `NEXT_PUBLIC_MEDUSA_BACKEND_URL` - Medusa backend URL (e.g., `https://your-backend.onrender.com`)

## 🔐 Security

- Never commit `.env` files
- Use environment variables for all secrets
- Enable CORS properly in production
- Validate all user inputs
- Use HTTPS in production
- Secure MongoDB connection with authentication

## 📝 Database Schema

Medusa v2 uses TypeORM for database management. Key entities:

**Medusa Core:**
- Products, Variants, Collections, Categories
- Orders, Customers, Regions

**Custom Entities (Admin Hub):**
- `admin_hub_categories` - Platform categories (with `has_collection`, `is_visible`)
- `admin_hub_banners` - Platform banners
- `regions` - Custom market regions
- `product_regions` - Product-region junction table

## 🧪 Testing

(To be implemented)

```bash
npm run test
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

[Add your license here]

## 🆘 Support

For issues and questions:
- Open an issue on GitHub
- Check the documentation
- Contact support

## 🔄 Updates

- Keep dependencies updated regularly
- Monitor security advisories
- Test thoroughly before deploying

---

**Built with ❤️ using Turborepo, Next.js, Medusa v2, PostgreSQL, and Stripe**
