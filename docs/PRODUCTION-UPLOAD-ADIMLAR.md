# Production’da Görsellerin Kalıcı Olması — Adım Adım

Bu rehber: **Render’da** deploy ettiğin **medusa-backend** servisinde yüklenen görsellerin deploy/restart sonrası kaybolmaması için ne yapacağını adım adım anlatır.

---

## Hangi proje / hangi servis?

- **Proje:** Belucha reponu deploy ettiğin Render **hesabı** (Account) altındaki **Dashboard**.
- **Servis:** Backend’i çalıştıran servis (örn. **medusa-backend** veya **belucha-backend**). Bu servis **Node** ile çalışıyor ve `server.js` / `apps/medusa-backend` kullanıyorsa doğru yer burası.
- **Env değişkenleri** ve **Disk** ayarlarını **sadece bu backend servisinde** yapacaksın (Shop veya Seller Central değil).

---

## Seçenek A — Render Disk (Kalıcı klasör)

Görselleri sunucunun kalıcı diskine yazdırmak için.

### 1. Render Dashboard’a gir

1. https://dashboard.render.com adresine git, giriş yap.
2. Sol menüden **Dashboard** (veya **My Services**) tıkla.
3. Listeden **medusa-backend** (veya backend’in adı ne ise) servisini seç.

### 2. Disk ekle

1. Servis sayfasında üstte **Environment**, **Settings**, **Logs** vb. sekmeler var.
2. **Settings** sekmesine tıkla.
3. Aşağı kaydır; **Disks** (veya **Persistent Disks**) bölümünü bul.
4. **Add Disk** (veya **Connect Disk**) butonuna tıkla.
5. Açılan formda:
   - **Name:** Örn. `uploads`
   - **Mount Path:** Tam olarak şunu yaz: **`/data/uploads`**
   - **Size:** İhtiyacına göre (örn. 1 GB).
6. **Save** / **Add** ile diski ekle.
7. Render isterse servisi **Redeploy** eder; onayla.

### 3. Environment variable ekle

1. Aynı serviste **Environment** sekmesine geç (veya sol menüden **Environment**).
2. **Environment Variables** bölümünde **Add Environment Variable** (veya **+ Add**) tıkla.
3. Sırayla ekle:

| Key (isim)     | Value (değer)   |
|----------------|-----------------|
| `UPLOAD_DIR`   | `/data/uploads` |

4. **Save Changes** tıkla.
5. Render “Redeploy” önerirse **Save and Deploy** (veya **Deploy**) ile yeniden deploy et.

Bu adımlardan sonra yeni yüklenen görseller `/data/uploads` altına yazılır ve redeploy’da silinmez.

---

## Seçenek B — S3 veya Cloudflare R2

Görselleri S3/R2’ye yükletmek için (Render’da disk kullanmadan).

### 1. Bucket / R2 hazırla

- **AWS S3:** AWS Console → S3 → bucket oluştur, public read (veya CloudFront) ile erişilebilir yap.
- **Cloudflare R2:** Cloudflare Dashboard → R2 → bucket oluştur, gerekirse public erişim (custom domain veya R2.dev URL) aç.

Bucket’a yazma için bir **Access Key** ve **Secret Key** oluştur (AWS IAM veya R2 API Tokens).

### 2. Render’da backend servisini aç

1. https://dashboard.render.com → **Dashboard** → **medusa-backend** (veya backend servisin adı).
2. **Environment** sekmesine gir.

### 3. Environment variable’ları ekle

**Environment Variables** bölümünde **Add Environment Variable** ile aşağıdakileri tek tek ekle.

**AWS S3 için örnek:**

| Key | Value (kendi değerlerinle değiştir) |
|-----|-------------------------------------|
| `S3_UPLOAD_BUCKET` | Bucket adın (örn. `belucha-uploads`) |
| `S3_UPLOAD_REGION` | Bölge (örn. `eu-central-1`) |
| `S3_UPLOAD_ACCESS_KEY_ID` | AWS Access Key ID |
| `S3_UPLOAD_SECRET_ACCESS_KEY` | AWS Secret Access Key |
| `S3_UPLOAD_PUBLIC_BASE_URL` | Görsellerin açıldığı adres (örn. `https://bucket-adin.s3.eu-central-1.amazonaws.com` veya CloudFront domain) |
| `S3_UPLOAD_ACL` | `public-read` |

**Cloudflare R2 için örnek:**

| Key | Value |
|-----|--------|
| `S3_UPLOAD_BUCKET` | R2 bucket adı |
| `S3_UPLOAD_REGION` | `auto` |
| `S3_UPLOAD_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (Cloudflare R2’den kopyala) |
| `S3_UPLOAD_ACCESS_KEY_ID` | R2 API token Access Key |
| `S3_UPLOAD_SECRET_ACCESS_KEY` | R2 API token Secret Key |
| `S3_UPLOAD_PUBLIC_BASE_URL` | R2 public URL (örn. `https://pub-xxx.r2.dev` veya kendi domain’in) |

Her satırı ekledikten sonra **Save Changes**; ardından **Save and Deploy** ile servisi yeniden deploy et.

---

## Görsellerin doğru URL ile dönmesi (her iki seçenek için)

Backend, store API’lerinde görsel URL’lerini oluştururken **SERVER_URL** kullanıyor (relative path’leri birleştirmek için).

1. Aynı **medusa-backend** servisinde **Environment** sekmesine git.
2. Şu değişkenin olduğundan emin ol:

| Key | Value |
|-----|--------|
| `SERVER_URL` | Backend’in dışarıdan erişilen adresi (örn. `https://medusa-backend-xxx.onrender.com`) |

- **Seçenek A (Disk):** Görseller aynı backend’den servis edilir; `SERVER_URL` doğru olmalı.
- **Seçenek B (S3/R2):** Görseller `S3_UPLOAD_PUBLIC_BASE_URL` üzerinden gider; yine de `SERVER_URL` backend’in kendi URL’i olarak kalmalı (API için).

---

## Özet tablo

| Ne yapıyorsun? | Nerede? | Menü / Yol |
|----------------|---------|------------|
| Disk eklemek | Render | Dashboard → **medusa-backend** servisi → **Settings** → **Disks** → Add Disk, Mount Path: `/data/uploads` |
| UPLOAD_DIR vermek | Render | Aynı servis → **Environment** → Add Variable → Key: `UPLOAD_DIR`, Value: `/data/uploads` |
| S3/R2 env’leri vermek | Render | Aynı servis → **Environment** → Add Variable ile tablodaki her bir key/value |
| SERVER_URL kontrolü | Render | Aynı servis → **Environment** → `SERVER_URL` = backend’in public URL’i |

Tüm env değişikliklerinden sonra **Save and Deploy** ile servisi yeniden deploy et; böylece production’da yeni yüklenen görseller kalıcı olur.
