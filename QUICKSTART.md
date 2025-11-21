# Quick Start Guide

Get Belucha up and running in minutes!

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] npm 9+ installed
- [ ] Supabase account created
- [ ] Stripe account created
- [ ] PostgreSQL database ready (Supabase provides this)

## Step-by-Step Setup

### 1. Clone and Install

```bash
git clone https://github.com/murathan-cotuk/belucha.git
cd belucha
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a project
2. Note your project URL and anon key
3. Get your database connection string from Settings > Database
4. Create a storage bucket named `media` for file uploads

### 3. Set Up Stripe

1. Go to [stripe.com](https://stripe.com) and create an account
2. Get your API keys from the Dashboard
3. Enable Stripe Connect for seller payouts

### 4. Configure Environment Variables

**Create `apps/cms/payload/.env`:**
```env
PAYLOAD_SECRET=your-random-secret-key-here
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001
PORT=3001
DATABASE_URI=postgresql://postgres:[password]@[host]:5432/postgres
```

**Create `apps/shop/.env.local`:**
```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Create `apps/sellercentral/.env.local`:**
```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 5. Initialize Payload CMS

```bash
cd apps/cms/payload
npm run generate:types
```

### 6. Start Development Servers

From the root directory:

```bash
npm run dev
```

This starts:
- Shop: http://localhost:3000
- Sellercentral: http://localhost:3002
- Payload CMS: http://localhost:3001

### 7. Access Payload Admin

1. Go to http://localhost:3001/admin
2. Create your first seller account (this will be your admin user)
3. Start creating products, categories, and brands!

### 8. Test the Shop

1. Visit http://localhost:3000
2. Browse products
3. View categories
4. Check product detail pages

### 9. Test Seller Central

1. Visit http://localhost:3002
2. Register a new seller account
3. Explore the dashboard

## Common Issues

### Port Already in Use

If ports 3000, 3001, or 3002 are in use, you can change them in:
- `apps/shop/package.json` (dev script)
- `apps/sellercentral/package.json` (dev script)
- `apps/cms/payload/.env` (PORT variable)

### Database Connection Error

- Verify your `DATABASE_URI` is correct
- Check Supabase database is running
- Ensure your IP is whitelisted in Supabase

### GraphQL Errors

- Make sure Payload CMS is running on port 3001
- Check `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` is correct
- Verify GraphQL is enabled in Payload config

## Next Steps

- Create your first product in Payload CMS
- Set up categories and brands
- Configure Stripe webhooks for order processing
- Customize the shop design
- Add more features to seller dashboard

## Need Help?

- Check the main [README.md](./README.md)
- Open an issue on GitHub
- Review the Payload CMS documentation

Happy building! 🚀

