# Deployment Guide

## Vercel Deployment

Bu monorepo projesi için Vercel'de 3 ayrı proje oluşturmanız gerekiyor:

### 1. Shop App (Customer-facing)

**Vercel Project Settings:**
- **Root Directory**: `apps/shop`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && npm install && npm run build --filter=@belucha/shop`
- **Output Directory**: `apps/shop/.next`
- **Install Command**: `cd ../.. && npm install`

**Environment Variables:**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://your-cms-url.com/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### 2. Sellercentral App (Seller Dashboard)

**Vercel Project Settings:**
- **Root Directory**: `apps/sellercentral`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && npm install && npm run build --filter=@belucha/sellercentral`
- **Output Directory**: `apps/sellercentral/.next`
- **Install Command**: `cd ../.. && npm install`

**Environment Variables:**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://your-cms-url.com/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### 3. Payload CMS (Backend)

Payload CMS'i ayrı bir servise deploy etmeniz gerekiyor (Vercel Serverless Functions veya Railway/Render).

**Railway/Render Deployment:**
- Root Directory: `apps/cms/payload`
- Build Command: `npm run build`
- Start Command: `npm start`
- Port: 3001 (veya ortam değişkeninden)

**Environment Variables:**
```
PAYLOAD_SECRET=your-secret-key-here
PAYLOAD_PUBLIC_SERVER_URL=https://your-cms-url.com
PAYLOAD_MONGO_URL=mongodb+srv://...
PORT=3001
NODE_ENV=production
```

## Vercel Monorepo Setup

### Option 1: Separate Projects (Recommended)

Her app için ayrı Vercel projesi oluşturun ve root directory'yi belirtin.

### Option 2: Vercel Monorepo

Eğer tek bir Vercel projesi kullanmak istiyorsanız:

1. Root'ta `vercel.json` oluşturun:
```json
{
  "builds": [
    {
      "src": "apps/shop/package.json",
      "use": "@vercel/next"
    },
    {
      "src": "apps/sellercentral/package.json",
      "use": "@vercel/next"
    }
  ],
  "routes": [
    {
      "src": "/shop/(.*)",
      "dest": "apps/shop/$1"
    },
    {
      "src": "/sellercentral/(.*)",
      "dest": "apps/sellercentral/$1"
    }
  ]
}
```

## Build Issues

Eğer build hataları alıyorsanız:

1. **Dependencies hatası**: Root'ta `npm install` çalıştırın
2. **Turbo hatası**: `turbo.json` dosyasının doğru olduğundan emin olun
3. **Path alias hatası**: `jsconfig.json` veya `tsconfig.json` dosyalarını kontrol edin

## Environment Variables Checklist

### Shop App
- [ ] `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### Sellercentral App
- [ ] `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### Payload CMS
- [ ] `PAYLOAD_SECRET`
- [ ] `PAYLOAD_PUBLIC_SERVER_URL`
- [ ] `PAYLOAD_MONGO_URL` veya `MONGODB_URI`
- [ ] `PORT`
- [ ] `NODE_ENV=production`

## Troubleshooting

### "Only sellercentral shows up"

Bu genellikle root directory ayarının yanlış olmasından kaynaklanır. Vercel dashboard'da:
1. Settings > General > Root Directory
2. Doğru app klasörünü seçin (`apps/shop` veya `apps/sellercentral`)

### Build fails with "Cannot find module"

1. Root'ta `npm install` çalıştırın
2. Workspace dependencies'in doğru yüklendiğinden emin olun
3. `.npmrc` dosyası oluşturun (eğer yoksa):
```
shamefully-hoist=true
```

### GraphQL connection errors

1. Payload CMS'in deploy edildiğinden emin olun
2. `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` environment variable'ının doğru olduğunu kontrol edin
3. CORS ayarlarını Payload CMS'de kontrol edin

