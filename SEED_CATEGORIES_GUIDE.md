# Category Seeding Guide

## How to Seed Categories

The seed script needs to run with proper environment variables. Here are the options:

### Option 1: Run with Payload CMS Server Running

1. **Start Payload CMS server** (in one terminal):
   ```bash
   cd apps/cms/payload
   npm run dev
   ```

2. **In another terminal, run the seed script**:
   ```bash
   cd apps/cms/payload
   npm run seed:categories
   ```

### Option 2: Set Environment Variables Manually

If you want to run the seed script without the server:

**Windows PowerShell:**
```powershell
cd apps/cms/payload
$env:DATABASE_URI="mongodb+srv://belucha:belucha@belucha.dijx1dj.mongodb.net/?appName=Belucha"
$env:PAYLOAD_SECRET="beluchaSecret123456789012345678901234567890"
npm run seed:categories
```

**Windows CMD:**
```cmd
cd apps/cms/payload
set DATABASE_URI=mongodb+srv://belucha:belucha@belucha.dijx1dj.mongodb.net/?appName=Belucha
set PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
npm run seed:categories
```

**Linux/Mac:**
```bash
cd apps/cms/payload
export DATABASE_URI="mongodb+srv://belucha:belucha@belucha.dijx1dj.mongodb.net/?appName=Belucha"
export PAYLOAD_SECRET="beluchaSecret123456789012345678901234567890"
npm run seed:categories
```

### Option 3: Use Payload Admin Panel

You can also manually create categories through the Payload Admin Panel at:
- Local: http://localhost:3001/admin
- Production: https://belucha-cms.railway.app/admin

Navigate to "Categories" and add categories manually.

## What Categories Will Be Created?

The seed script creates 15 main Amazon categories with subcategories:

1. Electronics
2. Computers
3. Home & Kitchen
4. Clothing, Shoes & Jewelry
5. Beauty & Personal Care
6. Health & Household
7. Sports & Outdoors
8. Toys & Games
9. Automotive
10. Tools & Home Improvement
11. Office Products
12. Books
13. Pet Supplies
14. Grocery & Gourmet Food
15. Industrial & Scientific

Each main category has multiple subcategories and nested categories, totaling over 100 categories.

## Troubleshooting

If you get "Database URL is required" error:
- Make sure `.env.local` file exists in `apps/cms/payload/` directory
- Or set environment variables manually (see Option 2)
- Or run with Payload CMS server running (see Option 1)

If categories already exist:
- The script will skip duplicate categories
- You'll see "⚠️ Already exists" messages for existing categories

