# Render PostgreSQL’deki veriyi görüntüleme

Render’da **built-in “tabloları göster” ekranı yok**. Veriyi görmek için dışarıdan bağlanıp sorgu çalıştırmanız gerekir.

---

## Yöntem 1: Projedeki script (önerilen)

Kategoriler **Render’daki** veritabanında; bilgisayarınızda script’i çalıştırıp **Render DB’ye bağlanırsınız**.

### 1. Render’dan connection string alın

1. https://dashboard.render.com → **belucha-medusa-db** servisine tıklayın.
2. **Connection** / **Info** kısmında **“External Database URL”** satırını bulun.
3. **Copy** ile tam URL’i kopyalayın. Örnek format:
   ```text
   postgresql://medusa_user:XXXXX@dpg-d5uhghhr0fns73eqihug-a.frankfurt-postgres.render.com/medusa_seoj?sslmode=require
   ```
   (Şifre kısmı sizin gerçek parolanız olacak.)

### 2. Script’i bu URL ile çalıştırın

Proje kökünden veya `apps/medusa-backend` içinden:

**PowerShell (Windows):** (URL'yi tek başına yazmayın; aşağıdaki iki komutu sırayla kullanın.)
```powershell
cd apps\medusa-backend
$env:DATABASE_URL="BURAYA_RENDER_EXTERNAL_URL_YAPIŞTIRIN"
node scripts/list-categories-in-db.js
```
Örnek (kendi şifrenizi kullanın):
```powershell
$env:DATABASE_URL="postgresql://medusa_user:SIFRE@dpg-d5uhghhr0fns73eqihug-a.frankfurt-postgres.render.com/medusa_seoj"
node scripts/list-categories-in-db.js
```

**Tek satırda (URL’i kendi değerinizle değiştirin):**
```powershell
cd apps\medusa-backend; $env:DATABASE_URL="postgresql://medusa_user:SIFRE@dpg-d5uhghhr0fns73eqihug-a.frankfurt-postgres.render.com/medusa_seoj?sslmode=require"; node scripts/list-categories-in-db.js
```

**Git Bash / Linux / macOS:**
```bash
cd apps/medusa-backend
export DATABASE_URL="postgresql://medusa_user:SIFRE@dpg-d5uhghhr0fns73eqihug-a.frankfurt-postgres.render.com/medusa_seoj?sslmode=require"
node scripts/list-categories-in-db.js
```

Bu komut **Render’daki** `admin_hub_categories` tablosuna bağlanıp kategorileri tablo halinde yazdırır. Lokal bir DB’ye ihtiyaç yok.

---

## Yöntem 2: GUI ile (DBeaver / pgAdmin)

1. **DBeaver** (https://dbeaver.io) veya **pgAdmin** indirip kurun.
2. Yeni **PostgreSQL** bağlantısı ekleyin.
3. Render’daki **External Database URL**’i kullanın:
   - Host: `dpg-d5uhghhr0fns73eqihug-a.frankfurt-postgres.render.com`
   - Port: `5432` (genelde URL’de yoksa 5432)
   - Database: `medusa_seoj`
   - Username: `medusa_user`
   - Password: Render’da gösterilen parola
   - SSL: **Require** veya **Allow**
4. Bağlandıktan sonra **Schemas → public → Tables → admin_hub_categories** üzerine sağ tıklayıp “View Data” veya “SELECT” ile veriyi görün.

---

## Özet

- Render’da “veritabanına tıklayıp tabloları gör” özelliği **yok**.
- Veriyi görmek için: **External Database URL** ile dışarıdan bağlanırsınız.
- En hızlı yol: **Yöntem 1** — `DATABASE_URL` ile `node scripts/list-categories-in-db.js` çalıştırmak (kategoriler deploy sonrası oluşturulduğu için bu bağlantı Render’daki DB’ye yapılır).
