# HANDOFF — Cursor plan → Claude (2026-10-07)

**Claude:** Bu dosyayı oku ve uygula. Uygulamis olabilecegin bölümleri kontrol et. Kullanıcı Cursor’da planladı; sen kodu yaz. `CLAUDE.md` kurallarına uy. Commit/push/backfill `--apply` yalnız kullanıcı açıkça isterse.

**Sıra:** Faz 0 → 0b → 0c → 0e → 0d → 0f → 1 → 2 → 3.  
**Backfill:** `backfill-variants-to-products.js --apply` ayrı onay.

Kaynak plan: Cursor `sc_variation_parity` (bu dosya özet + uygulanabilir spesifikasyon).

---

## Kısmen yapılmış (Cursor oturumu)

- Shop kategori filtreleri: `apps/shop/src/lib/catalog-listing.js` — varyasyon eksenleri (`design`, `groesse`, `opt_dimensions`); `filterFacetsToCatalog(..., products)` Category/Search/brand/`[handle]` call site’larına bağlandı. Canlı deploy gerekebilir.
- SellerCentral bildirim / shop-visibility / ProductEdit layout işleri önceki turda; bu handoff’un parçası değil.

---

## Kullanıcı kuralları (tekrar)

- **Asıl ürün = varyasyon.** Parent çatı; her SC ürün sayfası aynı görünmeli.
- Uydurma SEO/CMS metni yok. Garanti metni 6 dilde sabit dictionary; sayfa içeriği uydurma.
- Para/backend hesapları bozulmasın.
- Küçük odaklı diff.

---

## Referans görseller

| Dosya | Ne |
|-------|-----|
| `pic/eprel1.png` | Amazon: varyasyon üstü enerji sınıfı rozeti + Ürün fişi |
| `pic/eprel2.png` | Tıklanınca enerji etiketi modalı |
| `pic/gewahrleistung.png` | Description altı “Güvenlik ve ürün kaynakları” 2 kolon |

---

## Faz 0 — Shop Eigenschaften birleştir + packaging gizle

**Dosya:** `ProductTemplate.jsx`, `ProductTemplateMobile.jsx`

- Aynı metafield key → tek satır, değerler virgülle.
- Parent+variant aynı key bir kez.
- Gizle: `packaging_unit`, `packaging_unit_plural` (`META_HIDDEN_KEYS` + metafields filter).

## Faz 0b — Add-existing EAN 400

**Dosya:** `apps/medusa-backend/src/routes/admin-products.js` ~1702–1718

- Non-owner listing: master EAN “cannot be changed” check atlama.
- Owner: `normalizeStoreEan` ile karşılaştır.
- Listing EAN master’a yazılmasın.

## Faz 0c — SC Legal: WEEE ≠ EPREL + required UX + manuel Required/Optional

**Dosyalar:** `ProductEditPage.jsx`, `VariantEditPage.jsx`, `ComplianceFieldsSection.jsx`, `ComplianceProfilesPage.jsx`, `categories.js`, `compliance-profiles.json`

- Ayrı bloklar: WEEE | EPREL | Produktdateien.
- Required: kırmızı `*`; boşken kırmızı çerçeve; optional required’dan sonra.
- Manuel alanlar: Required|Optional (`required` flag; default true). Schema merge buna göre.

## Faz 0e — EPREL alanları (WEEE değil)

Profil `energy_labeled_eprel` / group `eprel` iken:

| Alan | Anlam |
|------|--------|
| `energy_class_scale` | A–G skala |
| `energy_class_grade` | Harf A…G |
| `eprel_number` | EPREL kayıt no |
| `energy_label_image` | Etiket görseli |
| `energy_label_qr` | Ürün fişi / EPREL URL |

Detaylı help_text_i18n. WEEE altına URL yok.

## Faz 0d — Shop PDP

| Ne | Nerede |
|----|--------|
| `weee_number` | Buybox only |
| EPREL grade dolu | Varyasyon seçici **üstünde** rozet (eprel1) → tık modal (eprel2) |
| Diğer legal gruplar | Description yanında **grup tab’leri** (eprel, electrical, GPSR, custom…) — tek “Legal” değil |
| `custom_*` etiket | `custom_test` → **Test** (`localizeMetaKey` strip) |
| Eigenschaften | Merkez tablo; legal tab’e karışmaz |

Eski alttaki tek `produktsicherheit` yığını tab’e taşınır.

## Faz 0f — Güvenlik ve ürün kaynakları (`gewahrleistung.png`)

Description **hemen altında**, her ürün:

1. Başlık 6 dil (Güvenlik ve ürün kaynakları / …).
2. Sol: Yasal garanti — AB ≥2 yıl metni 6 dil + “Daha fazla bilgi” → `warranty_info_url` (SU ayarı; default `/pages/gewaehrleistung`).
3. Sağ: GPSR kişiler linki + `safety_information_text` / `safety_information_pdf`.

SC Settings (superuser): `warranty_info_url`. Ürün Legal: güvenlik metin+PDF. Garanti metni üründe edit edilmez.

## Faz 1 — Farbe ≠ Design

`ProductEditPage`: Select’te label+key; `metafield_key` doğru kalır; `getGroupDisplayName` o key’in label’ı. Test: farbe → Design remap olmasın.

## Faz 2 — Variant = Product form parity

Ortak sellable form; VariantEditPage ülke fiyatları; aynı Genel/Spez/Rechtlich düzeni.

## Faz 3 — family_link

`legacyFold: false`; çocuklar ProductEditPage; backfill dry-run only unless kullanıcı `--apply` der.

---

## Doğrulama checklist

- [ ] Design iki değer → tek satır `a, b`; packaging unit yok
- [ ] Add-existing SKU+fiyat → 200, EAN 400 yok
- [ ] SC: WEEE ≠ EPREL; required `*`; manuel Required|Optional
- [ ] Shop: EPREL rozet→modal; WEEE buybox; description tab’leri; güvenlik bölümü + SU link
- [ ] Farbe seç → Farbe kalır
- [ ] `custom_test` etiketi Test

## Claude kickoff (kullanıcı Claude’a yapıştırabilir)

```
docs/HANDOFF-cursor-plan-sc-variation-compliance.md dosyasını oku.
Faz 0’dan başla, sırayla uygula. CLAUDE.md kurallarına uy.
Backfill --apply ve commit yapma; ben demeden.
```
