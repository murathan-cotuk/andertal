<<<<<<< HEAD
# belucha
=======
# Belucha - E-commerce Marketplace Monorepo

A complete e-commerce marketplace platform built with Turborepo, featuring a customer-facing shop, seller dashboard, and Payload CMS backend.

## 🏗️ Project Structure

```
belucha/
├── apps/
│   ├── shop/              # Customer-facing Next.js 14 store
│   ├── sellercentral/     # Seller dashboard Next.js 14 app
│   └── cms/
│       └── payload/       # Payload CMS backend
├── packages/
│   ├── ui/                # Shared design system components
│   ├── lib/               # Shared utilities (Apollo, Supabase, Stripe, SEO)
│   └── config/            # Shared configs (Tailwind, ESLint, TypeScript)
└── turbo.json             # Turborepo configuration
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL database (Supabase recommended)
- Supabase account for authentication and storage
- Stripe account for payments

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

   Create `.env` files in each app directory:

   **Root `.env` (optional for local development)**
   ```env
   # Shared environment variables
   ```

   **`apps/cms/payload/.env`**
   ```env
   PAYLOAD_SECRET=your-secret-key-here
   PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001
   PORT=3001
   DATABASE_URI=postgresql://user:password@host:port/database
   ```

   **`apps/shop/.env.local`**
   ```env
   NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
   ```

   **`apps/sellercentral/.env.local`**
   ```env
   NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
   ```

   **Root `.env` (for Stripe server-side)**
   ```env
   STRIPE_SECRET_KEY=your-stripe-secret-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   ```

4. **Set up Supabase**

   - Create a new Supabase project
   - Get your project URL and anon key
   - Set up PostgreSQL database
   - Configure authentication providers
   - Set up storage buckets for media

5. **Set up Stripe**

   - Create a Stripe account
   - Get your API keys (publishable and secret)
   - Configure webhooks for order processing
   - Set up Stripe Connect for seller payouts

6. **Initialize Payload CMS**

   ```bash
   cd apps/cms/payload
   npm run generate:types
   ```

## 🛠️ Development

### Run all apps in development mode

```bash
npm run dev
```

This will start:
- **Shop app**: http://localhost:3000
- **Sellercentral app**: http://localhost:3002
- **Payload CMS**: http://localhost:3001

### Run individual apps

```bash
# Shop app only
cd apps/shop
npm run dev

# Sellercentral app only
cd apps/sellercentral
npm run dev

# Payload CMS only
cd apps/cms/payload
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
- Category navigation
- Product detail pages
- Shopping cart (to be implemented)
- Checkout with Stripe (to be implemented)
- User authentication via Supabase

**Tech Stack:**
- Next.js 14 (App Router)
- Tailwind CSS + Styled Components
- Apollo Client (GraphQL)
- Aeonik font family

### 📦 Sellercentral App (`apps/sellercentral`)

Complete seller dashboard for managing products, orders, and analytics.

**Features:**
- Dashboard with statistics
- Inventory management
- Media library
- Analytics and reports
- Product management
- Brand management
- Store settings
- Apps marketplace
- Seller registration (free, 10% commission)

**Tech Stack:**
- Next.js 14 (App Router)
- Tailwind CSS + Styled Components
- Apollo Client (GraphQL)
- Shared UI components

### 🗄️ Payload CMS (`apps/cms/payload`)

Headless CMS backend with GraphQL API.

**Collections:**
- **Products**: Product catalog with images, pricing, inventory
- **Categories**: Product categories with hierarchy
- **Brands**: Brand information
- **Sellers**: Seller accounts with Stripe Connect integration
- **Customers**: Customer profiles linked to Supabase auth
- **Orders**: Order management with commission tracking
- **Media**: Media library for images and files

**Features:**
- GraphQL API enabled
- PostgreSQL database (Supabase)
- Admin panel at `/admin`
- File uploads to Supabase storage

## 📚 Shared Packages

### `@belucha/ui`

Shared design system components:
- Button
- Input
- Card
- (Extendable for more components)

### `@belucha/lib`

Shared utilities and configurations:
- **Apollo Client**: GraphQL client setup
- **Supabase**: Client and server-side clients
- **Stripe**: Payment processing and commission calculations
- **SEO**: Meta tag generation helpers

### `@belucha/config`

Shared configurations:
- Tailwind CSS configs
- ESLint configs
- TypeScript configs

## 🔌 Integrations

### Supabase

Used for:
- User authentication (customers and sellers)
- PostgreSQL database
- File storage (media uploads)
- Real-time subscriptions (optional)

### Stripe

Used for:
- Payment processing
- Checkout sessions
- Seller payouts (10% commission deducted)
- Stripe Connect for seller accounts

### Apollo GraphQL

All apps use Apollo Client to consume the Payload CMS GraphQL API.

## 🚢 Deployment

### Vercel Deployment

Both Next.js apps can be deployed separately on Vercel:

1. **Shop App**
   - Connect your GitHub repo to Vercel
   - Set root directory to `apps/shop`
   - Add environment variables
   - Deploy

2. **Sellercentral App**
   - Create a new Vercel project
   - Set root directory to `apps/sellercentral`
   - Add environment variables
   - Deploy

3. **Payload CMS**
   - Deploy to a Node.js hosting service (Railway, Render, etc.)
   - Or use Vercel Serverless Functions
   - Set up PostgreSQL database
   - Configure environment variables

### Environment Variables for Production

Make sure to set all required environment variables in your hosting platform:

**Shop & Sellercentral:**
- `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` - Your Payload CMS GraphQL endpoint
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key

**Payload CMS:**
- `PAYLOAD_SECRET` - Secret key for Payload
- `PAYLOAD_PUBLIC_SERVER_URL` - Public URL of your CMS
- `DATABASE_URI` - PostgreSQL connection string
- `PORT` - Server port (default: 3001)

**Server-side (API routes):**
- `STRIPE_SECRET_KEY` - Stripe secret key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## 🔐 Security

- Never commit `.env` files
- Use environment variables for all secrets
- Enable CORS properly in production
- Use Supabase Row Level Security (RLS) for database access
- Validate all user inputs
- Use HTTPS in production

## 📝 Database Schema

The Payload CMS collections define the database schema. Key relationships:

- Products belong to Sellers and Categories
- Orders contain Products and belong to Customers
- Sellers have Stripe Connect accounts for payouts
- Customers are linked to Supabase user IDs

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

**Built with ❤️ using Turborepo, Next.js, Payload CMS, Supabase, and Stripe**

>>>>>>> dev
