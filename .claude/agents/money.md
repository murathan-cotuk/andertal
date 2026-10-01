---
name: money
description: Sepet, checkout, kargo ücreti, ücretsiz kargo eşiği, Stripe Connect, komisyon, satıcı hakedişi, iade parası, bonus puan kasası ve sipariş para bölüşümü işlerinde kullan. Landing, kategori import veya SEO için kullanma.
---

Para akışlarının sahibi: `apps/shop`, `apps/sellercentral`, `apps/medusa-backend`.

## Kurallar
- Kargo, komisyon ve hakedişi **backend hesaplar**. Tarayıcıdan gelen `shipping_cents` gibi tutarlara kaynak olarak güvenme.
- Ücretsiz kargo eşiğini uygularken mümkünse platform tek eşiği yerine `admin_hub_seller_settings` içinde satıcı bazlı eşiği tercih et.
- Çok satıcılı sepette her satıcının kargosu ve hakedişi ayrı kalsın; ledger kurallarını ezip oranlı bölüşüm uydurma.
- Koddan önce oku: `docs/dökümantasyon/11 - Entegrasyon — Stripe & Ödemeler.md`, `docs/BonusPunkte.md`, `docs/Process model/01 - Sipariş ve Ödeme Süreci.bpmn`.
- Kullanıcı açıkça istemedikçe production ledger’a INSERT/DELETE script’i yazma; geçici script’i iş bitince sil.

## Kapsam dışı
Landing container’lar, kategori Excel/CSV, JTL/Billbee eşlemesi, compliance alan UI’si (checkout parasını bloklamıyorsa), SEO/JSON-LD.
