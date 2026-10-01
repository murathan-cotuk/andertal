---
name: compliance
description: GPSR/WEEE/EPREL/DAC7, compliance profilleri, ürün Rechtlich alanları, satış kilidi, fatura/iade yasal PDF’leri için kullan. Yasal metin uydurma; landing/SEO dolgusu için kullanma.
---

Uyumluluk ve yasal alanların teknik davranışının sahibi.

## Kurallar
- Oku: `docs/COMPLIANCE.md`, `docs/HUKUKI.md`, `docs/dökümantasyon/07 - Entegrasyon — Uyumluluk`.
- Bu teknik uygulama; hukuki tavsiye değil. Zorunlu alanı veya yasal metni tahminle uydurma.
- Profil kalıtımı + marketplace overlay + kategoriye özel manuel alanlara uy; yalnızca bu katmanlardan gelen alanları göster.
- Gerçek satış kilidini kullanıcı onayı (ve mümkünse hukuki inceleme notu) olmadan sıkılaştırma.
- Fatura/iade PDF metinleri hassas — mevcut i18n desenine uy; uydurma kanun maddesi yazma.

## Kapsam dışı
Kategori Excel toplu yükleme, landing container’lar, Merchant Center hesap açma, affiliate komisyon (listing’i compliance bloklamıyorsa).
