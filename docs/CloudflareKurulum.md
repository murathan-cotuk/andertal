# Cloudflare kurulum rehberi

Bu rehber, Andertal projesinde Cloudflare’ı nasıl kullanacağını adım adım anlatır. İki ana kullanım var: **R2** (görsel depolama) ve **Pages** (shop/sellercentral deploy).

---

## 1. Cloudflare’da ne yapacağız?

| Kullanım | Açıklama |
|----------|----------| 
| **R2 Object Storage** | Sellercentral’dan yüklenen görsellerin kalıcı ve her yerden erişilebilir olması için. Backend (Render) R2’ye yazar; ayrı bir “uygulama” deploy etmiyorsun. |
| **Cloudflare Pages** | İstersen **shop** (mağaza) ve **sellercentral** (panel) uygulamalarını burada yayınlarsın. Her biri için ayrı Pages projesi. |

Backend (medusa-backend) Render’da kalır; Cloudflare’da sadece R2 + isteğe bağlı Pages kullanılır.

---

## 2. Hesap ve giriş

1. [dash.cloudflare.com](https://dash.cloudflare.com/) adresine git.
2. Giriş yap veya yeni hesap oluştur.
3. GitHub’ı bağlamak (Pages için): **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → GitHub’ı seç, repo’yu seç. Bu adımı shop veya sellercentral’ı deploy edeceksen yap.

---

# Bölüm A: R2 kurulumu (görsel upload’lar için)

Sellercentral’dan eklenen görsellerin kaybolmaması ve her cihazdan açılması için R2 kullanılır. Backend’in env’lerine R2 bilgilerini ekleyeceksin (Render’da).

---

## A.1 R2’yi açma

1. Cloudflare Dashboard’da sol menüden **R2 Object Storage**’a tıkla.
2. İlk kez kullanıyorsan **Enable R2** / **Get started** de.

---

## A.2 Bucket oluşturma

1. R2 sayfasında **Create bucket**’a tıkla.
2. **Bucket name:** Örn. `andertal-uploads` (küçük harf, tire; boşluk kullanma).
3. **Location:** Automatic bırak.
4. **Create bucket** de.
5. Bu ismi not et → Render’da `S3_UPLOAD_BUCKET` olacak.

---

## A.3 API token (Access Key) oluşturma

1. R2 sayfasında **Manage R2 API Tokens**’a tıkla.
2. **Create API token** de.
3. **Token name:** Örn. `andertal-render-uploads`.
4. **Permissions:** **Object Read & Write**. İstersen “Apply to specific buckets only” deyip sadece `andertal-uploads` seç.
5. **Create API Token** de.
6. Açılan ekranda **Access Key ID** ve **Secret Access Key** bir kez gösterilir. İkisini de kopyalayıp güvenli yere kaydet (Secret’ı sonra tekrar göremezsin).
   - Bunlar → Render’da `S3_UPLOAD_ACCESS_KEY_ID` ve `S3_UPLOAD_SECRET_ACCESS_KEY`.

---

## A.4 S3 endpoint (Account ID) bulma

1. Dashboard’da R2 veya ana sayfada **Account ID**’ni bul (örn. `a1b2c3d4e5f6g7h8i9j0`).
2. Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - Örnek: `https://a1b2c3d4e5f6g7h8i9j0.r2.cloudflarestorage.com`
   - Bu → Render’da `S3_UPLOAD_ENDPOINT`.

---

## A.5 Bucket’a public erişim verme

1. R2 → kendi bucket’ına tıkla (örn. `andertal-uploads`) → **Settings**.
2. **Public access** bölümünde erişimi aç (Allow Access / Enable public access).
3. Cloudflare bir **public URL** verir: `https://pub-xxxxxxxxxxxxx.r2.dev` (sondaki `/` olmasın).
   - Bu → Render’da `S3_UPLOAD_PUBLIC_BASE_URL`.

---

## A.6 Render’a environment variable ekleme

1. **Render Dashboard** → **medusa-backend** servisi → **Environment**.
2. Aşağıdaki 6 değişkeni ekle (kendi değerlerinle):

| Key | Value |
|-----|--------|
| `S3_UPLOAD_BUCKET` | Bucket adı (örn. `andertal-uploads`) |
| `S3_UPLOAD_REGION` | `auto` |
| `S3_UPLOAD_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_UPLOAD_ACCESS_KEY_ID` | A.3’teki Access Key ID |
| `S3_UPLOAD_SECRET_ACCESS_KEY` | A.3’teki Secret Access Key |
| `S3_UPLOAD_PUBLIC_BASE_URL` | A.5’teki public URL (örn. `https://pub-xxx.r2.dev`) |

3. **Save** de, ardından **Redeploy** et.

---

## A.7 R2 testi

1. Sellercentral’dan yeni bir görsel yükle.
2. Veritabanında `admin_hub_media` tablosunda ilgili satırın `url` kolonu `https://pub-xxx.r2.dev/uploads/...` şeklinde olmalı.
3. Bu URL’i tarayıcıda aç; görsel görünüyorsa R2 kurulumu tamam.

---

# Bölüm B: Cloudflare Pages ile Shop / Sellercentral deploy

Shop (müşteri mağazası) veya Sellercentral (satıcı paneli) uygulamasını Cloudflare Pages’te yayınlamak için aşağıdaki adımları uygula. **Her uygulama için ayrı bir Pages projesi** oluştur.

---

## B.1 Yeni Pages projesi oluşturma

1. **Workers & Pages** → **Create** → **Pages**.
2. **Connect to Git**’i seç.
3. GitHub hesabını bağla (izin ver).
4. **Repository** olarak `andertal` repo’sunu seç.
5. **Project name:** Shop için örn. `andertal-shop`, Sellercentral için `andertal-sellercentral`.
6. **Production branch:** `main` (veya kullandığın ana branch).

---

## B.2 Build configuration

Monorepo kökünde `npx wrangler deploy` çalıştırmak **“workspace root”** hatası verir. Bu yüzden build ve deploy komutlarını aşağıdaki gibi ayarlaman gerekir.

### Shop (müşteri mağazası) için

| Alan | Değer |
|------|--------|
| **Build command** | `npm ci && npx turbo run build --filter=@andertal/shop` |
| **Deploy command** | `cd apps/shop && npx wrangler pages deploy .next --project-name=andertal-shop` |
| **Non-production branch deploy command** | `cd apps/shop && npx wrangler versions upload` (veya boş bırak) |
| **Path** | Boş bırak |

`andertal-shop` yerine B.1’de verdiğin **proje adını** yaz.

### Sellercentral (satıcı paneli) için

| Alan | Değer |
|------|--------|
| **Build command** | `npm ci && npx turbo run build --filter=@andertal/sellercentral` |
| **Deploy command** | `cd apps/sellercentral && npx wrangler pages deploy .next --project-name=andertal-sellercentral` |
| **Non-production branch deploy command** | `cd apps/sellercentral && npx wrangler versions upload` (veya boş) |
| **Path** | Boş bırak |

Yine proje adını kendi isminle değiştir.

---

## B.3 Environment variables (Pages)

Shop veya Sellercentral’ın backend’e istek atabilmesi için Pages projesinde env tanımlaman gerekebilir:

- **Shop:** Örn. `NEXT_PUBLIC_MEDUSA_BACKEND_URL` = Render’daki backend URL’i.
- **Sellercentral:** Aynı şekilde backend URL ve gerekirse diğer `NEXT_PUBLIC_*` değişkenleri.

Cloudflare Pages → projen → **Settings** → **Environment variables** kısmından ekle (Production / Preview için).

---

## B.4 İlk deploy

1. Build configuration ve (gerekirse) env’leri kaydettikten sonra **Save** de.
2. **Deploy** tetiklenir (veya **Retry deployment** ile yeniden çalıştır).
3. Build ve deploy tamamlandığında Cloudflare bir URL verir (örn. `https://andertal-shop.pages.dev`). Bu adresi kullanarak shop veya sellercentral’a erişirsin.

---

# Sorun giderme

## “Cannot find module '@sentry/nextjs'” veya “Root directory = apps/shop” kullanıyorsan

**Sebep:** Build, **repo kökü yerine** sadece `apps/shop` içinde çalışıyorsa (Cloudflare’da **Root directory** = `apps/shop` ise) kök `package.json`’daki bağımlılıklar yüklenmez; `next.config.js` içindeki `@sentry/nextjs` bulunamaz.

**Çözüm (tercih edilen):** Build’in **repo kökünden** çalışmasını sağla:

- **Root directory / Path:** Boş bırak (proje kökü = repo kökü).
- **Build command:** `npm ci && npx turbo run build --filter=@andertal/shop`

Böylece `npm ci` repo kökünde çalışır, tüm workspace ve `@sentry/nextjs` yüklenir; sadece shop build edilir.

**Alternatif:** Root directory’yi `apps/shop` bırakmak istiyorsan, shop’un `package.json`’ında `@sentry/nextjs` tanımlı olmalı (projede eklendi). Yine de `@andertal/lib` ve `@andertal/ui` workspace paketleri için repo kökünden build almak daha güvenilir.

## “Wrangler has been run in the root of a workspace...”

**Sebep:** Deploy command monorepo kökünde çalışıyor.

**Çözüm:** Deploy command’da önce uygulama klasörüne gir: `cd apps/shop` veya `cd apps/sellercentral`, sonra `npx wrangler pages deploy ...`. B.2’deki değerleri bire bir kullan.

---

## Build’de “MISSING_MESSAGE” (cart, checkout, pages.orders)

**Sebep:** Shop’un çeviri dosyalarında `cart`, `checkout`, `pages.orders` anahtarları eksikti.

**Çözüm:** Bu anahtarlar projede eklendi. En güncel kodu çekip (`git pull`) tekrar build al.

---

## R2’ye yüklenen görsel açılmıyor

- Render’daki 6 env değişkeninin doğru olduğundan emin ol.
- Bucket’ta **public access** açık mı kontrol et (A.5).
- `S3_UPLOAD_PUBLIC_BASE_URL` sonunda `/` olmasın.

---

## Proje adını nerede görürüm?

Cloudflare Dashboard → **Workers & Pages** → ilgili proje → **Settings** → **Project name**.

---

# Özet checklist

**R2 (görsel depolama):**
- [ ] R2 bucket oluşturuldu.
- [ ] API token oluşturuldu; Access Key ID ve Secret kopyalandı.
- [ ] Endpoint (Account ID) ve public URL alındı.
- [ ] Render’da medusa-backend için 6 env eklendi ve redeploy yapıldı.
- [ ] Test upload ile URL’in R2’den açıldığı doğrulandı.

**Pages (shop/sellercentral):**
- [ ] GitHub bağlandı, repo seçildi.
- [ ] Build command ve Deploy command B.2’ye göre ayarlandı (cd apps/shop veya apps/sellercentral ile).
- [ ] Gerekli env’ler (backend URL vb.) Pages’te tanımlandı.
- [ ] İlk deploy başarıyla tamamlandı.

Bu rehber, R2 ve Pages kurulumunu tek dosyada toplar. Ek detay için repo kökündeki `CLOUDFLARE-BUILD-CONFIG.md` ve medusa-backend docs’taki upload/R2 dokümanlarına bakabilirsin.

---

# Wrangler kodda olmalı mı? Push gerekli mi?

## Wrangler

Evet. **Wrangler** projede tanımlı olmalı ki Cloudflare build ortamında aynı sürüm kullanılsın ve her seferinde `npx` ile indirilmesin. Kök `package.json` içine **devDependency** olarak eklendi:

```json
"devDependencies": {
  ...
  "wrangler": "^3.94.0"
}
```

Build komutu `npm ci` çalıştırdığı için wrangler yüklenecek; deploy komutundaki `npx wrangler pages deploy ...` bu sürümü kullanacak.

## Push

Evet, **push etmelisin**. Cloudflare Pages, GitHub’a bağlıysa:

- **main** (veya seçtiğin production branch) branch’ine **push** veya **merge** yaptığında Cloudflare otomatik **build + deploy** tetikler.
- Yaptığın kod değişiklikleri (rehber, wrangler eklemesi, build config düzeltmeleri vb.) ancak **push** edilince Cloudflare’da yeni build’e yansır.

Yani: Değişiklikleri commit edip **push** et; Cloudflare tarafında yeni build ve deploy kendiliğinden çalışır (Build command ve Deploy command’ı doğru girdiysen).
