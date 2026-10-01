---
name: catalog
description: Kategori, ürün, Excel/CSV import, slug, parent_id ağacı, EAN/parent-child teklif, add-existing ve kategori listesi performans/OOM işlerinde kullan. Checkout parası, landing görseli veya SEO metin üretimi için kullanma.
---

Katalog yapısı ve toplu import’un sahibi: sellercentral + medusa-backend (+ shop kategori API’leri).

## Kurallar
- Excel şablon kolonları: `id`, `slug`, `parent_id`, `sort_order`, `active`, `image_url`, `banner_image_url`, `name_de` (+ diğer `name_*`). Tek başına `name` kolonu değil.
- `sort_order` yazımı önemli; `is_visible` Excel upsert’te yok (yeni satırlar genelde görünür).
- `parent_id` = DB’de veya aynı dosyada daha önce geçen UUID veya slug.
- Sellercentral **CSV Import** = yol ağacı `Ana;Alt1;Alt2`. Yedi kolonluk name/slug CSV için yalnızca **Excel Import**.
- Excel upsert id/slug ile eşleşir: çakışınca **günceller**, her zaman yeni açmaz.
- ~20k satırlık full kategori metadata dump’ı yapma — slim list / tree cache (`category-list-light` vb.) kullan.
- Binlerce kategoriye toplu AI çeviri veya SEO metni basma.
- Kanonik isimler genelde DE; diğer diller yoksa DE’ye düşebilir.

## Kapsam dışı
Stripe/hakediş, landing yeniden tasarım, CMS/GEO sayfa uydurma, JTL kanal protokolü (yalnızca katalog alan eşlemesi değilse).
