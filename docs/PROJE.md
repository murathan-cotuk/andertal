# BELUCHA – Proje

## Render (Medusa backend)

**Önerilen ayar (Root = apps/medusa-backend):**

- **Root Directory:** `apps/medusa-backend` (mutlaka dolu; boş bırakma).
- **Build Command:** `npm install`
- **Start Command:** `npm run start`

Böylece `npm run start`, `apps/medusa-backend` içinde çalışır ve bu package.json'daki `start` script'i (`node server.js`) kullanılır. Patch, `postinstall` ile install sonrası uygulanır; karmaşık build gerekmez.

**Alternatif (repo kökünden deploy):**

- **Root Directory:** boş (repo kökü)
- **Build Command:** `npm install && node apps/medusa-backend/scripts/patch-link-modules.js`
- **Start Command:** `node apps/medusa-backend/server.js`

server.js runtime'da `__dirname` ve `process.cwd()`'den yukarı çıkıp her bulduğu `node_modules/@medusajs/medusa` kopyasına patch uygular.
