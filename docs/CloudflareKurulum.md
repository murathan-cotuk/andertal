# Cloudflare + R2 — ne yap, ne kontrol et

Hedef trafik (~30k gün / ~1000 anlık, 10k kategori, 140k ürün) için **görseller Render’dan çıkmalı**, sayfa/HTML mümkünse Cloudflare kenarında cache’lenmeli.

İki ayrı şey:

| Ne | Ne işe yarar | Senin yaptığın / yapacağın |
|----|----------------|----------------------------|
| **Proxy (turuncu bulut)** | Site trafiği Cloudflare üzerinden gider; HTML/JS cache + DDoS koruması | Domain’i Cloudflare’a almak |
| **R2** | Ürün görselleri Render bandwidth’ine yazılmaz | Bucket + token + Render/Shop env |

---

**Önemli — eski görseller:** Katalogdaki çoğu URL hâlâ `/uploads/...` (Render diski).
Bunları R2’ye **otomatik taşımayız**. `NEXT_PUBLIC_UPLOADS_BASE_URL` shop’ta olsa bile
relative `/uploads` yolları backend’den servis edilir. Sadece **yeni** upload’lar
(R2 env’li backend) DB’ye `https://pub-….r2.dev/media/...` yazar.

Eski dosyaları R2’ye taşıyana kadar shop env’den `NEXT_PUBLIC_UPLOADS_BASE_URL`
**zorunlu değil** (zararsız da bırakılabilir).

---

## 0) Domain proxy — kontrol listesi (muhtemelen yaptın)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → domain → **DNS**
2. Shop / sellercentral / api kayıtlarında bulut **turuncu (Proxied)** olsun.
3. **SSL/TLS** → **Full (strict)** (Render’da da HTTPS varsa).
4. **Caching → Configuration**: Caching Level = Standard.

### Cache Rules (önerilen — 2 dk)

**Rules → Cache Rules → Create rule**

**Kural 1 — statik asset (uzun cache)**  
- If: URI Path starts with `/_next/static`  
- Then: Eligible for cache → Edge TTL = 1 month  

**Kural 2 — HTML kısa cache (isteğe bağlı)**  
- If: URI Path does not start with `/api` AND `/_next`  
- Then: Eligible for cache → Edge TTL = 1–5 dakika (veya Bypass if dynamic checkout/cart paths break)

Checkout / account / cart path’leri bozulursa o path’leri **Bypass cache** ile hariç tut.

Proxy tek başına görsel kotasını çözmez; **R2 şart**.

---

# A) R2 (görsel depolama) — adım adım

## A.1 R2 aç + bucket

1. Sol menü: **R2 Object Storage** → Enable.
2. **Create bucket** → ad örn. `andertal-uploads` → Create.
3. Not et → `S3_UPLOAD_BUCKET`

## A.2 API token

1. R2 → **Manage R2 API Tokens** → Create.
2. Permissions: **Object Read & Write** (bucket’a kısıtla).
3. **Access Key ID** + **Secret Access Key** kopyala (bir kez görünür).
   - → `S3_UPLOAD_ACCESS_KEY_ID`
   - → `S3_UPLOAD_SECRET_ACCESS_KEY`

## A.3 Endpoint (Account ID)

Account ID’yi dashboard’da bul.

```
S3_UPLOAD_ENDPOINT = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_UPLOAD_REGION   = auto
```

## A.4 Public access

1. Bucket → **Settings** → Public access aç.
2. Public URL al: `https://pub-xxxxx.r2.dev` (sonda `/` yok).
   - → `S3_UPLOAD_PUBLIC_BASE_URL`
   - → Shop/Sellercentral: `NEXT_PUBLIC_UPLOADS_BASE_URL` (**aynı değer**)

İstersen custom domain: R2 → Custom Domains → `media.senindomain.com` bağla; o zaman public base = `https://media.senindomain.com`.

## A.5 Render — medusa-backend Environment

| Key | Value |
|-----|--------|
| `S3_UPLOAD_BUCKET` | `andertal-uploads` |
| `S3_UPLOAD_REGION` | `auto` |
| `S3_UPLOAD_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_UPLOAD_ACCESS_KEY_ID` | (token) |
| `S3_UPLOAD_SECRET_ACCESS_KEY` | (token) |
| `S3_UPLOAD_PUBLIC_BASE_URL` | `https://pub-xxxxx.r2.dev` |

Save → **Redeploy** backend.

## A.6 Shop + Sellercentral Environment

Aynı public base’i ekle (Render Pages veya nerede deploy ediyorsan):

| Key | Value |
|-----|--------|
| `NEXT_PUBLIC_UPLOADS_BASE_URL` | `https://pub-xxxxx.r2.dev` (veya `https://media.…`) |

Redeploy shop + sellercentral.

Kod: `/uploads/...` yolları tarayıcıda doğrudan R2’ye gider; Render’dan görsel byte çekilmez.

## A.7 Test

1. Sellercentral’dan yeni görsel yükle.
2. DB `admin_hub_media.url` → `https://pub-….r2.dev/media/...` olmalı.
3. URL’yi tarayıcıda aç → görsel gelmeli.
4. Shop’ta ürün kartında img `src` R2 host’u göstermeli (DevTools).

Eski `/uploads/...` URL’leri: backend R2 açıksa `/uploads/*` → R2’ye **redirect** eder. Dosya R2’de yoksa 404; eski disk dosyalarını bir kez R2’ye taşıman gerekir (Render Shell / sync).

---

# B) Pages deploy (opsiyonel)

Shop/sellercentral hâlâ Render’daysa **zorunlu değil**. Cloudflare Pages’e almak istersen eski B.1–B.4 bölümü geçerli (`npm ci` + turbo filter + `cd apps/shop` wrangler deploy). Backend Render’da kalır.

---

# C) Kod tarafı (zaten yapıldı — bilmen yeterli)

- Ortak R2/S3 upload (`forcePathStyle`, uzun `Cache-Control`)
- Shop/Sellercentral `NEXT_PUBLIC_UPLOADS_BASE_URL` ile CDN URL
- Backend: R2 varken `/uploads` → public URL redirect
- Ürün listelerinde “5000 hepsini çek” kaldırıldı (EAN/marka SQL filtre + sayfalı sitemap)

---

# D) Sorun giderme

| Belirti | Kontrol |
|---------|---------|
| Upload 500 / storage failed | 6 Render env doğru mu? Endpoint Account ID mi? |
| Görsel 404 R2’de | Public access açık mı? Key `media/...` mi? |
| Shop hâlâ onrender.com/uploads | `NEXT_PUBLIC_UPLOADS_BASE_URL` shop’ta var mı + redeploy? |
| Checkout bozuldu | Cloudflare Cache Rule’da `/api`, cart, checkout Bypass |

---

# E) Kısa checklist

**Proxy**
- [ ] DNS Proxied (turuncu)
- [ ] SSL Full (strict)
- [ ] Cache Rules (static uzun TTL)

**R2**
- [ ] Bucket + token + endpoint + public URL
- [ ] Render backend 6 env + redeploy
- [ ] Shop + sellercentral `NEXT_PUBLIC_UPLOADS_BASE_URL` + redeploy
- [ ] Test upload → R2 URL açılıyor

**Yük**
- [ ] Büyük katalog import’u batch
- [ ] Render planı Hobby değil (RAM/CPU ayrı konu; bandwidth’i R2 çözer)
