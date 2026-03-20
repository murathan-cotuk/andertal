# Cloudflare Build configuration – ne yazmalıyım?

Monorepo kökünde `npx wrangler deploy` çalıştığı için hata alıyorsun. Aşağıdaki gibi doldur.

---

## Hangi uygulamayı deploy ediyorsun?

- **Müşteri mağazası (shop)** → Aşağıdaki “Shop” bölümünü kullan.
- **Satıcı paneli (sellercentral)** → “Sellercentral” bölümünü kullan.

Her biri için **ayrı** bir Cloudflare Pages projesi aç. Bir projede shop, diğerinde sellercentral.

---

## Shop (müşteri mağazası) için

| Alan | Değer |
|------|--------|
| **Build command** | `npm ci && npx turbo run build --filter=@belucha/shop` |
| **Deploy command** | `cd apps/shop && npx wrangler pages deploy .next --project-name=belucha-shop` |
| **Non-production branch deploy command** | `cd apps/shop && npx wrangler versions upload` (veya boş bırak) |
| **Path** | Boş bırak (repo kökü) |

`belucha-shop` yerine Cloudflare’da oluşturduğun **Pages proje adını** yaz.

---

## Sellercentral (satıcı paneli) için

| Alan | Değer |
|------|--------|
| **Build command** | `npm ci && npx turbo run build --filter=@belucha/sellercentral` |
| **Deploy command** | `cd apps/sellercentral && npx wrangler pages deploy .next --project-name=belucha-sellercentral` |
| **Non-production branch deploy command** | `cd apps/sellercentral && npx wrangler versions upload` (veya boş bırak) |
| **Path** | Boş bırak |

Yine `belucha-sellercentral` yerine kendi **proje adını** yaz.

---

## Özet

- **Build command:** Kökte `npm ci` + sadece ilgili uygulama için `turbo run build --filter=...`.
- **Deploy command:** Mutlaka `cd apps/shop` veya `cd apps/sellercentral` ile uygulama klasörüne girip sonra `npx wrangler pages deploy .next --project-name=PROJE_ADI` çalıştır. Böylece Wrangler monorepo kökünde değil, uygulama dizininde çalışır.

Proje adını Cloudflare Dashboard → Pages → projen → **Settings** → **Project name** kısmından alırsın.
