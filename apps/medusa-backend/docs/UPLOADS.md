# Görsel / Upload kalıcılığı

## Neden yüklediğim görseller 2 gün sonra placeholder görünüyor?

Varsayılan olarak backend **yerel diske** (`uploads/` veya `UPLOAD_DIR`) kaydediyor. Birçok bulut hostunda (Railway, Render vb.) dosya sistemi **geçicidir**: redeploy veya restart sonrası `uploads/` silinir. Veritabanında URL kalsa bile dosya artık yoktur; görsel placeholder kalır.

**Backend dosyayı silmiyor**; ortam yeniden oluştuğu için disk sıfırlanıyor.

## Kalıcı çözüm (production)

### 1. S3 / uyumlu object storage (önerilen)

Görselleri diske değil **S3** (veya R2, MinIO vb.) yükleyin. Veritabanında tam URL saklanır; sunucu yenilense bile görseller kalır.

Backend’de aşağıdaki ortam değişkenlerini ayarlayın:

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `S3_UPLOAD_BUCKET` | Evet | S3 bucket adı |
| `S3_UPLOAD_REGION` | Evet | Örn. `eu-central-1` |
| `S3_UPLOAD_ACCESS_KEY_ID` | Evet* | AWS (veya uyumlu) access key |
| `S3_UPLOAD_SECRET_ACCESS_KEY` | Evet* | AWS secret key |
| `S3_UPLOAD_PUBLIC_BASE_URL` | Hayır | Bucket’ın public URL’i (yoksa `https://BUCKET.s3.REGION.amazonaws.com` kullanılır) |
| `S3_UPLOAD_ENDPOINT` | Hayır | Özel endpoint (R2, MinIO için) |
| `S3_UPLOAD_ACL` | Hayır | Örn. `public-read` |

\* IAM / instance role kullanıyorsanız credential’ları vermeyebilirsiniz.

Örnek (AWS S3):

```env
S3_UPLOAD_BUCKET=my-app-uploads
S3_UPLOAD_REGION=eu-central-1
S3_UPLOAD_ACCESS_KEY_ID=AKIA...
S3_UPLOAD_SECRET_ACCESS_KEY=...
S3_UPLOAD_ACL=public-read
```

Cloudflare R2 örneği:

```env
S3_UPLOAD_BUCKET=my-bucket
S3_UPLOAD_REGION=auto
S3_UPLOAD_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_UPLOAD_ACCESS_KEY_ID=...
S3_UPLOAD_SECRET_ACCESS_KEY=...
S3_UPLOAD_PUBLIC_BASE_URL=https://pub-xxx.r2.dev
```

Bu değişkenler tanımlıysa yeni yüklemeler doğrudan S3’e gider; URL olarak `S3_UPLOAD_PUBLIC_BASE_URL` veya bucket URL’i kullanılır.

### 2. Kalıcı disk (UPLOAD_DIR)

Hosting sağlayıcı **persistent volume** veriyorsa, upload klasörünü oraya taşıyın:

```env
UPLOAD_DIR=/data/uploads
```

`/data` volume’e bağlı olmalı; böylece redeploy’da dosyalar silinmez.

### 3. Varsayılan (geliştirme)

Hiçbiri ayarlanmazsa `server.js` yanındaki `uploads/` kullanılır. Bu ortam **geçicidir**; production’da S3 veya `UPLOAD_DIR` kullanın.

Özet: Görseller “silinmiyor”; disk geçici olduğu için kayboluyor. Kalıcılık için **S3** (veya uyumlu storage) veya **UPLOAD_DIR** ile kalıcı volume kullanın.
