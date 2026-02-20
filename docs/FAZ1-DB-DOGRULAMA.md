# Faz 1 – DB’de depolama doğrulama

Backend’de eklenen tüm veriler PostgreSQL’de (Render: belucha-medusa-db) saklanır. Yeni entity eklenmedi; mevcut tablolar kullanılıyor.

| Veri        | Tablo(lar)                | Doğrulama script’i              |
|------------|---------------------------|----------------------------------|
| Kategoriler | `admin_hub_categories`    | `npm run db:categories`          |
| Banner’lar | `admin_hub_banners`       | `npm run db:banners`             |
| Menüler    | `admin_hub_menus`, `admin_hub_menu_items` | `npm run db:menus`   |
| Ürünler    | `product` (Medusa core)   | `npm run db:products`            |

**Kullanım (apps/medusa-backend):**
```bash
# Render DB için DATABASE_URL set edin (External URL), sonra:
npm run db:categories
npm run db:products
npm run db:menus
npm run db:banners
```

Ürün listesinin görünmesi için Medusa migration’larının çalışmış olması gerekir (`product` tablosu link-modules ile oluşturulur).
