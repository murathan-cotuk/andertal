# Belucha Project Structure

Complete overview of the monorepo structure and architecture.

## 📁 Directory Structure

```
belucha/
├── apps/
│   ├── shop/                    # Customer-facing e-commerce store
│   │   ├── src/
│   │   │   ├── app/            # Next.js 14 App Router
│   │   │   │   ├── page.tsx    # Homepage
│   │   │   │   ├── product/[slug]/  # Product pages
│   │   │   │   └── category/[slug]/ # Category pages
│   │   │   └── components/
│   │   │       ├── Navbar.tsx  # Navigation with search
│   │   │       ├── SlimBar.tsx # Bestsellers/Sales bar
│   │   │       ├── Footer.tsx  # Footer with "Become a seller" link
│   │   │       └── templates/  # Product & Category templates
│   │   └── package.json
│   │
│   ├── sellercentral/           # Seller dashboard
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx    # Dashboard home
│   │   │   │   ├── inventory/  # Inventory management
│   │   │   │   ├── media/      # Media library
│   │   │   │   ├── analytics/  # Analytics
│   │   │   │   ├── reports/    # Reports
│   │   │   │   ├── products/   # Product management
│   │   │   │   ├── brand/      # Brand management
│   │   │   │   ├── store/      # Store settings
│   │   │   │   ├── apps/       # Apps marketplace
│   │   │   │   └── register/   # Seller registration
│   │   │   └── components/
│   │   │       ├── DashboardLayout.tsx  # Sidebar layout
│   │   │       └── pages/      # Page components
│   │   └── package.json
│   │
│   └── cms/
│       └── payload/             # Payload CMS backend
│           ├── src/
│           │   ├── collections/ # CMS collections
│           │   │   ├── Products.ts
│           │   │   ├── Categories.ts
│           │   │   ├── Brands.ts
│           │   │   ├── Sellers.ts
│           │   │   ├── Customers.ts
│           │   │   ├── Orders.ts
│           │   │   └── Media.ts
│           │   ├── payload.config.ts
│           │   └── server.ts
│           └── package.json
│
├── packages/
│   ├── ui/                      # Shared UI components
│   │   ├── src/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Card.tsx
│   │   └── package.json
│   │
│   ├── lib/                     # Shared utilities
│   │   ├── src/
│   │   │   ├── apollo/         # Apollo Client config
│   │   │   ├── stripe/         # Stripe helpers
│   │   │   └── seo/            # SEO helpers
│   │   └── package.json
│   │
│   └── config/                  # Shared configs
│       ├── tailwind/           # Tailwind configs
│       ├── eslint/             # ESLint configs
│       └── tsconfig/           # TypeScript configs
│
├── package.json                 # Root package.json
├── turbo.json                   # Turborepo config
├── tsconfig.json                # Root TypeScript config
├── README.md                    # Main documentation
├── QUICKSTART.md               # Quick start guide
└── .gitignore                  # Git ignore rules
```

## 🏗️ Architecture

### Frontend Apps

**Shop App** (`apps/shop`)
- Next.js 14 with App Router
- Tailwind CSS + Styled Components
- Apollo Client for GraphQL
- Customer-facing storefront

**Sellercentral App** (`apps/sellercentral`)
- Next.js 14 with App Router
- Shared UI components
- Apollo Client for GraphQL
- Seller dashboard with sidebar navigation

### Backend

**Payload CMS** (`apps/cms/payload`)
- Headless CMS with GraphQL API
- MongoDB database
- Admin panel at `/admin`
- Collections for all data models

### Shared Packages

**@belucha/ui**
- Reusable React components
- Styled Components
- Design system foundation

**@belucha/lib**
- Apollo Client configuration
- Stripe payment helpers
- SEO utilities

**@belucha/config**
- Shared Tailwind configurations
- ESLint rules
- TypeScript configs

## 🔌 Integrations

### MongoDB
- Primary database for all data
- Products, orders, sellers, customers storage
- Media metadata storage
- Local or cloud (MongoDB Atlas) deployment

### Stripe
- Payment processing
- Checkout sessions
- Seller payouts (10% commission)
- Stripe Connect integration

### Apollo GraphQL
- All apps consume Payload CMS GraphQL API
- Centralized data fetching
- Caching and state management

## 📊 Data Flow

```
Customer/Seller → Next.js App → Apollo Client → Payload CMS GraphQL → MongoDB
                                                      ↓
                                              Stripe (Payments)
```

## 🚀 Deployment

- **Shop**: Deploy to Vercel (port 3000)
- **Sellercentral**: Deploy to Vercel (port 3002)
- **Payload CMS**: Deploy to Node.js hosting (port 3001)

All apps can be deployed independently while sharing the same backend.

## 🔐 Environment Variables

Each app requires specific environment variables (see README.md for details):
- Payload CMS GraphQL URL
- MongoDB connection string
- Stripe keys

## 📝 Key Features

### Shop App
- ✅ Product browsing
- ✅ Category navigation
- ✅ Search functionality
- ✅ Product detail pages
- ✅ Category pages
- ✅ Responsive design

### Sellercentral App
- ✅ Dashboard with stats
- ✅ Inventory management
- ✅ Media library
- ✅ Analytics
- ✅ Reports
- ✅ Product management
- ✅ Brand management
- ✅ Store settings
- ✅ Apps marketplace
- ✅ Seller registration

### Payload CMS
- ✅ GraphQL API
- ✅ Admin panel
- ✅ Product management
- ✅ Order tracking
- ✅ Seller management
- ✅ Media uploads

## 🛠️ Development Workflow

1. Run `npm install` at root
2. Set up environment variables
3. Run `npm run dev` to start all apps
4. Access:
   - Shop: http://localhost:3000
   - Sellercentral: http://localhost:3002
   - Payload CMS: http://localhost:3001/admin

## 📦 Build & Deploy

- `npm run build` - Build all apps
- `npm run lint` - Lint all code
- `npm run format` - Format code

Each app can be built and deployed independently.
