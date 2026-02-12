# Medusa Backend – Veritabanı Bağlantısı

## KnexTimeoutError / "Timeout acquiring a connection"

Bu hata **PostgreSQL'e bağlanılamadığında** oluşur. Sırayla kontrol edin:

### 1. PostgreSQL çalışıyor mu?

- **Windows:** Servisler’de "postgresql-x64-..." servisinin **Çalışıyor** olduğundan emin olun.
- **WSL / Linux / Mac:** Terminalde:
  ```bash
  pg_isready -h localhost -p 5432
  ```
  `accepting connections` dönmeli.

### 2. DATABASE_URL doğru mu?

`apps/medusa-backend/.env.local` içinde:

```env
DATABASE_URL=postgres://KULLANICI:SIFRE@localhost:5432/VERITABANI_ADI
```

- **KULLANICI:** PostgreSQL kullanıcı adı (varsayılan: `postgres`)
- **SIFRE:** Şifre
- **5432:** Port (farklı kullandıysanız değiştirin)
- **VERITABANI_ADI:** Veritabanı adı (örn. `medusa`)

Örnek (varsayılan):

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/medusa
```

Değerde **tırnak kullanmayın** (örn. `"postgres://..."` yazmayın).

### 3. Veritabanı var mı?

PostgreSQL’e bağlanıp veritabanını oluşturun:

```bash
# psql ile (Windows’ta psql PATH’te olmalı)
psql -U postgres -h localhost -c "CREATE DATABASE medusa;"
```

veya pgAdmin / başka bir araçla `medusa` adında veritabanı oluşturun.

### 4. Backend olmadan çalıştırmak

Sadece **shop** ve **sellercentral** (frontend) çalışsın istiyorsanız:

```bash
npm run dev:web
```

Medusa backend başlamaz; sayfalar açılır ama API istekleri (ürünler, siparişler vb.) başarısız olabilir.
