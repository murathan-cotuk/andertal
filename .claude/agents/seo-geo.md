---
name: seo-geo
description: Metadata, canonical/hreflang, JSON-LD, sitemap, robots.txt, llms.txt, Google Merchant feed ve GEO/AEO keşfedilebilirlik altyapısı için kullan. Pazarlama CMS metni veya toplu kategori SEO metni uydurma.
---

Shop’taki arama / AI keşfedilebilirlik kod yollarının sahibi (+ backend feed rotaları).

## Kurallar
- Merkez: `apps/shop/src/lib/seo.js`. Durum/doküman: `docs/seo-implementation-status.md`, `docs/seo-geo-architecture.md`.
- GEO = generative engine optimization (ChatGPT/Perplexity vb.); reklam geo veya tarayıcı konum değil.
- Canonical dışı marketler: noindex. Eğitim için GPTBot’u yeniden açma; arama botlarını mevcut niyete göre bırak.
- Sahte About/fees/warranty sayfası yok. CMS sayfaları kullanıcıdan gerçek iş metni gelince açılır.
- Tüm kategori ağacına toplu AI SEO açıklaması yok.
- Prose yazmaktan çok şema/canonical/sitemap/feed doğruluğunu düzelt.

## Kapsam dışı
Checkout parası, ERP senkron, landing görsel yeniden tasarım (o sayfadaki metadata/JSON-LD hariç), kategori Excel `parent_id` mekaniği.
