# BELUCHA – Proje

## Render (Medusa backend)

Repo'da `workspaces` kullanıldığı için Node modülleri **repo root** (`/opt/render/project/src/node_modules`) üzerinden yüklenir. Root Directory = `apps/medusa-backend` olsa bile bu böyledir. Bu yüzden patch'in **repo root**'taki `node_modules` üzerinde, **build sırasında** uygulanması gerekir.

**Render ayarları (bunları kullan):**

- **Root Directory:** *boş bırak* (repo kökü; alanı sil veya boş bırak).
- **Build Command:** `npm install && node apps/medusa-backend/scripts/patch-link-modules.js`
- **Start Command:** `node apps/medusa-backend/server.js`

Bu ayarla:
- Build repo root'ta çalışır, tek `node_modules` root'ta oluşur.
- Patch script root (ve varsa backend) içindeki her `@medusajs/medusa` kopyasına uygulanır.
- Start doğrudan `node apps/medusa-backend/server.js` ile yapılır; root package.json'da "start" script'i aranmaz.

**Eski ayar (Root = apps/medusa-backend)** bu monorepo'da MODULE_NOT_FOUND verebilir; çünkü yükleme root'taki node_modules üzerinden olur ve orası build sırasında patch'lenmiyor.
