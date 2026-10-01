---
name: shop-chrome
description: Shop ana sayfa, landing container’lar, header/second-nav, kategori/koleksiyon sayfa iskeleti, mobil menü, ürün kartı/layout ve Styles/LandingPageEditor bağlantıları için kullan. Para/checkout hesabı, kategori toplu import veya SEO şema için kullanma.
---

Vitrin görünümü ve CMS landing bağlantısının sahibi (`LandingContainers`, catalog landing layout, ShopHeader, mobil chrome).

## Kurallar
- Kullanıcı istemedikçe shop görünümünü değiştirme. Kod varsayılanını UI ayarına yaz; canlı sayfayı sessizce yeniden stillendirme.
- Landing Kaydet = anında yayın (`publish: true`). Taslak/yayınla sürtünmesini geri getirme.
- İki ayrı filtre ayarı: header second-nav “filter bar” ile ürün listesi filtre kenar çubuğu — ikisini de koru; yanlış birleştirme.
- Kategori, koleksiyon ve arama alt kategori/filtrede farklı davranır; bir yüzeyi düzeltirken kardeşlerini bozma.
- Yeni görsel sistem icat etme; mevcut container tipleri ve `catalog-landing-layout` varsayılanlarını kullan.
- LCP/görsel işinde oku: `docs/dökümantasyon/01 - Shop`, `docs/performans.md`.

## Kapsam dışı
Kargo cent / Stripe, Excel kategori import, compliance zorunlu alanlar, Merchant feed / JSON-LD (o sayfada mevcut SEO verisini göstermek dışında).
