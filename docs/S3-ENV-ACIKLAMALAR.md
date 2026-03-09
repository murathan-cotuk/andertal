# S3 / R2 Environment Değişkenleri — Ne Yazacağım?

Bu dosya: **S3_UPLOAD_*** ve **S3_UPLOAD_ENDPOINT** değişkenlerinin ne olduğunu, değer olarak ne yazacağını ve bu değeri **nereden alacağını** adım adım anlatır.

---

## S3_UPLOAD_BUCKET

- **Ne?** Dosyaların (görsellerin) gideceği “kova”nın (bucket) adı.
- **Değer olarak ne yazacaksın?** Sadece bucket adı, tırnak veya https yok. Örnek: `belucha-uploads`
- **Nereden alacaksın?**
  - **AWS S3:** AWS Console → S3 → Buckets. Bucket oluştururken veya listeye baktığında gördüğün isim.
  - **Cloudflare R2:** Cloudflare Dashboard → R2 → Buckets. Bucket oluştururken yazdığın veya listede gördüğün isim.

---

## S3_UPLOAD_REGION

- **Ne?** Bucket’ın bulunduğu bölge (sadece AWS S3 için anlamlı).
- **Değer olarak ne yazacaksın?**
  - **AWS S3 kullanıyorsan:** Bölge kodu. Örnek: `eu-central-1`, `us-east-1`. Bucket’ı hangi bölgede oluşturduysan onu yaz.
  - **Cloudflare R2 kullanıyorsan:** Her zaman tam olarak şunu yaz: `auto`
- **Nereden alacaksın?** AWS S3’te bucket oluştururken “Region” seçtiğin yerde yazar. R2’de sabit: `auto`.

---

## S3_UPLOAD_ACCESS_KEY_ID

- **Ne?** S3 veya R2’ye “yazma yetkisi” veren anahtarın kullanıcı adı gibi olan kısmı.
- **Değer olarak ne yazacaksın?** Uzun bir metin (AWS’te genelde `AKIA...` ile başlar, R2’de farklı uzunlukta olabilir). Boşluk veya tırnak ekleme; olduğu gibi kopyala.
- **Nereden alacaksın?**
  - **AWS S3:** AWS Console → IAM → Users → (bir kullanıcı seç veya oluştur) → Security credentials sekmesi → **Create access key**. Açılan ekranda **Access key ID** kopyala.
  - **Cloudflare R2:** Cloudflare Dashboard → R2 → **Manage R2 API Tokens** → **Create API token**. Açılan ekranda **Access Key ID** (veya benzeri) kopyala; bu değeri bu env’e yapıştıracaksın.

---

## S3_UPLOAD_SECRET_ACCESS_KEY

- **Ne?** Aynı anahtarın “şifre” kısmı. Çok gizli; kimseyle paylaşma, repo’ya koyma.
- **Değer olarak ne yazacaksın?** Uzun gizli metin. Sadece Render’daki Environment’a yapıştır; başka yerde saklama ihtiyacın varsa güvenli bir yere (şifre yöneticisi vb.) kaydet.
- **Nereden alacaksın?**
  - **AWS S3:** Access key oluştururken ekranda **Secret access key** bir kez gösterilir; “Show” deyip kopyala. Sonra bir daha gösterilmez.
  - **Cloudflare R2:** API token oluştururken **Secret Access Key** gösterilir; kopyala. Sonra tekrar gösterilmez.

---

## S3_UPLOAD_PUBLIC_BASE_URL

- **Ne?** Yüklenen görsele tarayıcıdan nasıl erişileceği. Sitede görsel açıldığında adres çubuğunda bu adresin başı çıkar.
- **Değer olarak ne yazacaksın?** Tam URL, https ile, sondaki slash olmadan. Örnek: `https://belucha-uploads.s3.eu-central-1.amazonaws.com` veya R2’de `https://pub-xxxx.r2.dev`
- **Nereden alacaksın?**
  - **AWS S3:** Bucket’ı “public” yaptıysan genelde: `https://BUCKET_ADI.s3.BOLGE.amazonaws.com` (BUCKET_ADI ve BOLGE’yi kendi bucket adın ve bölgenle değiştir). CloudFront kullanıyorsan: CloudFront’a verdiğin domain (örn. `https://d1234abcd.cloudfront.net`).
  - **Cloudflare R2:** R2 → ilgili bucket → **Settings** → **Public access** (R2.dev subdomain veya custom domain). Orada “Public bucket URL” veya “R2.dev subdomain” gibi bir adres verilir; onu kopyala. Kendi domain’in varsa onu da yazabilirsin.

---

## S3_UPLOAD_ENDPOINT (sadece Cloudflare R2)

- **Ne?** R2’nin S3 uyumlu API adresi. **AWS S3 kullanıyorsan bu değişkeni hiç ekleme.**
- **Değer olarak ne yazacaksın?** R2’nin verdiği endpoint tam adresi. Örnek: `https://1234567890abcdef.r2.cloudflarestorage.com`
- **Nereden alacaksın?** Cloudflare Dashboard → R2 → (bucket’a tıklamadan) genel R2 sayfasında veya bucket **Settings**’te **S3 API** bölümünde **Endpoint** satırı yazar. Account ID’li olan URL’i olduğu gibi kopyala.

---

## Özet tablo

| Değişken | Kısaca ne? | Örnek değer |
|----------|------------|-------------|
| S3_UPLOAD_BUCKET | Kova (bucket) adı | `belucha-uploads` |
| S3_UPLOAD_REGION | Bölge (S3) veya `auto` (R2) | `eu-central-1` veya `auto` |
| S3_UPLOAD_ACCESS_KEY_ID | Erişim anahtarı ID | `AKIA...` (AWS) veya R2’deki Access Key ID |
| S3_UPLOAD_SECRET_ACCESS_KEY | Erişim anahtarı gizli kısmı | (Oluştururken kopyaladığın uzun metin) |
| S3_UPLOAD_PUBLIC_BASE_URL | Görselin açılacağı adres | `https://bucket.s3.region.amazonaws.com` veya `https://pub-xxx.r2.dev` |
| S3_UPLOAD_ENDPOINT | Sadece R2; S3 API adresi | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |

Hepsini nereye yazacaksın? → Render’da backend servisi → **Environment** sekmesi → **Add Environment Variable** ile her biri için Key ve Value’yu gir.
