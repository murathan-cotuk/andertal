# Andertal — Claude Code kuralları

Çok satıcılı Avrupa pazaryeri monorepo. Ana uygulamalar: `apps/shop`, `apps/sellercentral`, `apps/medusa-backend` (ortak API), ayrıca `apps/affiliate`, `apps/developer`.

## Sabit mimari

- Kaynak gerçeklik: `admin_hub_*` tabloları + ham `pg`. Medusa native `product` / `product_category` varsayma.
- Şema: klasik migration yerine mevcut `ensure` / `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` desenini takip et.
- Auth: satıcı / müşteri / affiliate / developer JWT’leri ayrı secret’larla; Medusa admin auth’tan bağımsız.
- Staging DB yok. Production’a INSERT/DELETE script’i yalnızca kullanıcı açıkça isterse; iş bitince geçici script’i sil.

## Sakın

- Shop görünümünü “iyileştirmek” için istenmeden değiştirme (spacing, renk, layout). Kod varsayılanını UI’ya yaz; canlıyı bozma.
- Para (kargo, komisyon, hakediş, iade) **backend hesaplar**. Tarayıcıdan gelen `shipping_cents` vb. değerlere güvenme.
- Uydurma SEO / CMS / GEO metni üretme. Gerçek iş metni yoksa `/fees`, `/warranty` vb. sayfa açma.
- 24k kategoriye toplu AI çeviri / SEO metni basma.
- Kategori listesinde full metadata dump (`SELECT *` + translations) — OOM riski; slim list kullan.
- Commit / push yalnızca kullanıcı isterse. Force push / `--no-verify` yasak (kullanıcı açıkça demedikçe).

## Kategori & import

- Excel şablon kolonları: `id`, `slug`, `parent_id`, `sort_order`, `active`, `image_url`, `banner_image_url`, `name_de` (+ diğer dil kolonları). İsim kolonu `name` değil, `name_de`.
- `is_visible` Excel upsert’te yok; yeni kayıtta genelde `true`.
- `parent_id` = mevcut UUID veya slug (aynı dosya / DB). Sahte spreadsheet id kabul edilmez.
- Sellercentral **CSV Import** = `Ana;Alt1;Alt2` yol ağacı. 7 kolonluk name/slug CSV için değil — **Excel Import** kullan.
- Slug çakışırsa excel-upsert **günceller**, yeni satır açmaz.
- Landing kaydet = yayın (`publish: true`). “Filter bar” iki ayrı ayar: header second-nav vs ürün filtre sidebar’ı.

## i18n

- Shop / Sellercentral: 6 dil (`de`, `en`, `tr`, `fr`, `it`, `es`). Mevcut `lt` / `messages` / `metadata.translations` desenini kullan.
- Kanonik isim genelde DE; diğer diller çeviri yoksa DE’ye düşebilir — bu beklenen.

## SEO / GEO

- Merkez: `apps/shop/src/lib/seo.js`. Durum: `docs/seo-implementation-status.md`, mimari: `docs/seo-geo-architecture.md`.
- GEO = AI arama keşfi (ChatGPT vb.), ülke hedefleme değil.
- Canonical market dışı URL’ler noindex; GPTBot kapalı, OAI-SearchBot açık; `llms.txt` var.

## Para & kargo (bilinen açık)

- Platform ücretsiz kargo eşiği var; satıcı bazlı eşik / satıcı başına kargo hesabı henüz tamamlanmamış olabilir.
- Değiştirirken: `docs/dökümantasyon/11`, `docs/BonusPunkte.md`, Process model sipariş BPMN’ine bak. Hakediş ve Stripe Connect’i bozma.

## Çalışma düzeni

- İlgili dokümanı oku (`docs/dökümantasyon/…`, `docs/COMPLIANCE.md`, `docs/CONNECTOR.md`) sonra kod yaz.
- Küçük, odaklı diff. İlişkisiz refactor / dosya silme yok.
- Test: mevcut `node --test` / proje script’leri; production DB’ye karşı “temizle” döngüsü yalnızca izinle.
- Uzman agent’lar (varsa): `.claude/agents/` — `money`, `catalog`, `shop-chrome`, `erp`, `compliance`, `hukuki`, `seo-geo`. Hepsi Türkçe. Konuya göre onlara delege et.
- Haftalık hukuki tarama otomatik çalışmaz; kullanıcı “haftalık hukuki rapor” deyince veya Cursor Automation / hatırlatıcı ile `hukuki` agent tetiklenir.
