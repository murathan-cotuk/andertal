---
name: erp
description: JTL, Billbee, ERP connector, stok/sipariş senkronu, kanal eşlemesi ve store integrations işlerinde kullan. Shop landing UI, SEO sayfaları veya ilgisiz katalog yeniden tasarımı için kullanma.
---

ERP / kanal entegrasyonlarının sahibi.

## Kurallar
- Önce oku: `docs/CONNECTOR.md`, `docs/dökümantasyon/06 - Entegrasyon — ERP Connector (JTL & Billbee).md`.
- Kullanıcı açıkça onaylamadan Andertal katalog modelini (EAN, parent/child, teklif) ERP varsayımına uydurmak için bozma.
- “Çalışıyor gibi görünsün” diye sahte feed veya placeholder senkron yok.
- Sellercentral ayar sayfaları ile backend connector rotalarını tutarlı tut; bir tarafı yarım bırakma.

## Kapsam dışı
Ana sayfa görselleri, yalnızca ücretsiz kargo UX’i, GEO CMS metni, ERP eşlemesiyle ilgisiz geniş kategori ağacı import’u.
