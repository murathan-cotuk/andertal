1. GPSR neden “yanlış ölçekte” dedim?
Önce netleştireyim: GPSR (EU 2023/988) geniş kapsamlı bir AB düzenlemesi — çoğu tüketici ürünü için geçerli. Yani “hiç GPSR olmasın” demiyorum.

“Yanlış ölçekte” derken kastettiğim şu:

Sorun	Açıklama
Kategori ayrımı yok
Kitap, gıda, elektronik, kozmetik hepsine aynı 3 alan zorunlu. Oysa WEEE sadece elektrikli ürünlerde, EPREL sadece enerji etiketli ürünlerde geçerli. GPSR de her ürün tipinde farklı detay seviyesinde uygulanır.
Ülke ayrımı yok
GPSR AB genelinde geçerli; Almanya’ya özel, Fransa’ya özel ayrı sertifika değil. Ülkeye göre değişen kısım çoğunlukla dil, ulusal kayıt numarası, ambalaj sistemi — ayrı bir katman olmalı.
2. satıcı senaryosu bozuk
Mevcut EAN’e 2. satıcı eklerken GPSR alanları (hersteller vb.) zaten 1. satıcıda dolu olabilir; yine de her satıcıdan tekrar isteniyor.
Yayınlama kapısı yok
WEEE/EPREL backend’de hiç kontrol edilmiyor; GPSR ise her kayıtta blokluyor. Tutarsız.
“Sertifika” ile karıştırılıyor
GPSR bir sertifika değil; üretici bilgisi + AB’de sorumlu kişi + güvenlik dokümantasyonu. CE, WEEE, EPREL ayrı şeyler.
Doğru model: GPSR = genel taban katmanı (çoğu tüketici ürününde), WEEE/EPREL/CE = kategori profiline göre ek katman, ülke = marketplace overlay.

2. Avrupa’da ülke × sertifika matrisi
Önemli uyarı: Bu hukuki tavsiye değildir; canlıya almadan önce avukat/onaylı compliance danışmanı ile doğrulanmalıdır. AB’de çoğu ürün güvenliği ülke değil, ürün tipi ile belirlenir.

A) AB geneli (tüm üye ülkelerde aynı çerçeve)
Düzenleme	Hangi ürünler	Platformda istenecek alanlar
GPSR (2023/988)
Tüketici ürünleri (genel)
hersteller, hersteller_information, verantwortliche_person_information, güvenlik uyarıları, geri çağırma prosedürü
CE işareti
Düşük voltaj, makine, oyuncak, tıbbi cihaz (sınıf I-II), basınçlı ekipman, PPE, radyo ekipmanı vb.
ce_declaration_url, uygunluk beyanı PDF, test raporu referansı
WEEE / ElektroG
Elektrikli/elektronik ekipman
weee_number (ülkeye göre ulusal kayıt no.), geri dönüşüm sembolü
EPREL
Enerji etiketli ürünler (beyaz eşya, TV, ampul, klima...)
eprel_number, enerji etiketi görseli/QR
Batarya Yönetmeliği (2023/1542)
Piller, şarjlı cihazlar
Kapasite (Wh), kimyasal tip, geri dönüşüm sembolü, batarya kayıt no.
RoHS
EEE içindeki tehlikeli maddeler
Üretici beyanı (çoğu zaman CE paketinin parçası)
REACH / CLP
Kimyasallar, deterjan, boya, yapıştırıcı
SDS (Güvenlik Bilgi Formu) PDF
Kozmetik Yönetmeliği (1223/2009)
Kozmetik
INCI listesi, sorumlu kişi (RP), CPNP bildirimi ref.
Gıda Bilgisi Yönetmeliği
Gıda
İçerik, alerjen, son kullanma, besin değerleri
Takviye Gıda Direktifi
Besin takviyesi
İçerik, uyarı metinleri, günlük doz
Oyuncak Direktifi (2009/48/EC)
14 yaş altı oyuncak
CE, EN71 test raporu, yaş uyarısı
Tıbbi Cihaz (MDR 2017/745)
Tıbbi cihazlar
CE sınıfı, UDI, yetkili temsilci — marketplace’te çok riskli, ayrı onay şart
TPD / nikotin ürünleri
E-sigara, likit
TPD uyumluluk, yaş doğrulama, ülkeye göre yasaklar
Tekstil etiketleme
Giyim, ev tekstili
Fiber kompozisyonu, bakım sembolleri
Genetik mühendislik / Novel Food
Gıda takviyesi, kozmetik
Özel onay belgeleri
B) Ülkeye özel ek katmanlar (marketplace overlay)
Burada ülke farkı gerçekten devreye girer — ama yine ürün tipi + hedef ülke kombinasyonuyla:

Ülke	Ek gereklilik	Platform alanı
Almanya (DE)
ElektroG → Stiftung EAR WEEE no.
weee_number (DE format)
VerpackG → LUCID ambalaj kaydı
packaging_register_de
Pfand (depozito) → içecek şişeleri
pfand_system
BattG → batarya kaydı
battery_register_de
Etiket dili: Almanca zorunlu
label_language_de
Fransa (FR)
AGEC / Triman etiketi
triman_label_required
Nutri-Score (gıda)
nutri_score
Eco-organisme WEEE kaydı
weee_number_fr
Etiket dili: Fransızca
label_language_fr
İtalya (IT)
RAEE kaydı
weee_number_it
CONAI ambalaj
packaging_register_it
İspanya (ES)
RAEE / envío verde
weee_number_es
Avusturya (AT)
ARA/UFH ambalaj + WEEE
Ulusal kayıt no.
Hollanda (NL)
OPEN WEEE / Afvalfonds
Ulusal kayıt no.
Polonya (PL)
BDO kaydı
bdo_number
İsveç (SE)
FTI ambalaj
Ulusal kayıt
Tüm AB
GPSR sorumlu kişi AB içinde olmalı
verantwortliche_person_information
CE + uygunluk beyanı
ce_declaration_url
GDPR (kişisel veri değil ürün ama satıcı KYC)
Satıcı doğrulama
C) Pratik platform modeli
Katman 1: compliance_profile (ürün tipi)     → CE, WEEE, EPREL, kozmetik, gıda...
Katman 2: marketplace (DE, FR, IT...)        → dil, ulusal kayıt no., Triman, Nutri-Score
Katman 3: brand_authorization (marka)         → fatura, yetki belgesi, superuser onayı
24.000 kategori × 27 ülke × 50 sertifika diye tek tek yazmak yerine ~30–50 profil + ülke overlay yeterli.

3. Marka + fatura onayı — mevcut durum
Şu an admin_hub_brands tablosunda seller_id var ama onay akışı yok: satıcı marka oluşturur oluşturmaz aktif (brands.js POST → direkt INSERT). Ürünlerde brand_id kullanılıyor; kayıtlı marka için fatura/yetki kontrolü yok.

4. Claude’a verilecek talimatlar
Aşağıdaki iki bloğu docs/TASKS.md veya yeni bir docs/COMPLIANCE.md dosyasına yapıştırabilirsin. Agent mode’da “bu talimatları uygula” dersen doğrudan koda dökebilir.

TALİMAT A — Kategori + ülke bazlı compliance sistemi
# TASK: Compliance Profile System (kategori + marketplace bazlı hukuki gereklilikler)
## Bağlam
- Proje: andertal monorepo (medusa-backend, sellercentral, shop)
- Mevcut: GPSR 3 alanı TÜM ürünlerde zorunlu (`admin-products.js:validateRequiredGpsrMetadata`)
- Mevcut: WEEE/EPREL sabit UI (`ProductEditPage.jsx` ~2363-2388), backend validation YOK
- Mevcut: `admin_hub_categories.metadata` jsonb kolonu VAR ama kullanılmıyor
- Mevcut: `admin_hub_metafield_definitions` genel attribute kataloğu, kategoriye bağlı değil
- Hedef: Amazon Product Type modeli — 24k kategori için profil + inheritance, ülke overlay
## YAPMA
- 24.000 kategoriye tek tek kural yazma
- GPSR'yi tamamen kaldırma (genel tüketici profilinde kalsın)
- Ülke bazlı ayrı sertifika tablosu × 27 ülke × 24k kategori oluşturma
- Hukuki metinleri avukatsız "kesin doğru" diye işaretleme — `legal_disclaimer` alanı ekle
## YAP
### Faz 1 — Veri modeli
1. Yeni dosya: `apps/medusa-backend/src/compliance/compliance-profiles.json`
   - `profiles`: id, label, required_fields[], optional_fields[], blocked_publish_without[]
   - `field_definitions`: key, type (text|file|select|number), label_i18n, validation_regex, help_text_i18n
   - Başlangıç profilleri (en az 15):
     general_consumer_gpsr, electronics_weee, energy_labeled_eprel, battery_containing,
     cosmetics, food, food_supplement, toys, textiles, chemicals_reach, books_media,
     digital_goods, nicotine_tpd, medical_device (blocked by default — superuser only)
2. Yeni dosya: `apps/medusa-backend/src/compliance/marketplace-overlays.json`
   - marketplace: DE, FR, IT, ES, AT, NL, PL, SE, EU
   - Her overlay: extra_required_fields[], label_language, national_register_fields[]
3. DB migration veya startup SQL:
   - `admin_hub_categories.metadata` içine `compliance_profile_id` yazılacak (veya ayrı kolon)
   - Script: `apps/medusa-backend/scripts/assign-compliance-profiles.js`
     - CSV: category_slug_prefix → profile_id (ör. `electronics-*` → electronics_weee)
     - Parent'tan child'a inherit: child'da yoksa parent'ın profilini al
4. Yeni modül: `apps/medusa-backend/src/compliance/resolve-compliance.js`
   - `resolveComplianceProfile(categoryId, marketplace = 'DE')` → merged required fields
   - Category lineage: mevcut `category_ids` / parent_id zincirini kullan
   - `validateProductCompliance(metadata, categoryId, marketplace)` → { ok, missing[], invalid[] }
### Faz 2 — Backend validation
1. `admin-products.js`:
   - `validateRequiredGpsrMetadata` → sadece `general_consumer_gpsr` profilinde çağır
   - create/update/publish akışlarında `validateProductCompliance` kullan
   - `status: 'active'` yapmadan önce compliance gate
   - 2. satıcı listing: ortak ürün metadata'sında GPSR doluysa tekrar isteme
2. Yeni endpoint:
   - `GET /admin-hub/categories/:id/compliance-schema?marketplace=DE`
   - Sellercentral kategori seçince dinamik form için
3. Excel import (`sellercentral/.../import/route.js`):
   - Kategoriye göre zorunlu kolonları validate et
   - Eksik compliance → draft listing + superuser notification
### Faz 3 — Sellercentral UI
1. `ProductEditPage.jsx`:
   - Sabit WEEE/EPREL/GPSR bloklarını kaldır
   - Kategori + marketplace seçimine göre `ComplianceFieldsSection` dinamik render
   - Eksik alanlar kırmızı, save/publish engeli
2. Superuser: `ComplianceProfilesPage` (opsiyonel Faz 3b)
   - Profil listesi, kategori atama özeti, override
### Faz 4 — Shop gösterimi
1. `ProductTemplate.jsx` / `prop-labels.js`:
   - Sadece dolu compliance alanlarını göster (mevcut mantık korunur)
   - EPREL QR linki varsa tıklanabilir yap
## Kabul kriterleri
- [ ] Kitap kategorisinde WEEE/EPREL alanı GÖRÜNMEZ
- [ ] Elektronik kategorisinde WEEE zorunlu, eksikse active olamaz
- [ ] DE marketplace'te Almanca etiket uyarısı gösterilir
- [ ] 2. satıcı mevcut EAN'e eklerken dolu GPSR tekrar istenmez
- [ ] `npm run test` ve `node --check` temiz
- [ ] docs/COMPLIANCE.md'ye profil listesi ve hukuki disclaimer
## Dosyalar (tahmini)
- apps/medusa-backend/src/compliance/*.js, *.json
- apps/medusa-backend/src/routes/admin-products.js
- apps/medusa-backend/src/routes/categories.js (yeni endpoint)
- apps/sellercentral/src/components/pages/products/ProductEditPage.jsx
- apps/sellercentral/src/components/compliance/ComplianceFieldsSection.jsx (yeni)
- apps/shop/src/lib/prop-labels.js
## Risk
- Yüksek: yanlış profil ataması → satıcılar ürün yayınlayamaz. Mitigation: draft'ta kal, superuser override.
- Orta: mevcut ürünler compliance'sız active — migration sonrası bulk "needs_compliance_review" flag.

---

# 📋 DURUM RAPORU (Claude — 2026-07-07)

> Faz 1'in TEMEL veri modeli + resolve motoru kuruldu (saf ek dosyalar, hiçbir şeyi kırmıyor). **Backend'e BAĞLANMADI** — çünkü GPSR'yi profile-koşullu yapmadan önce kategori→profil ataması (Faz 1 adım 3) şart; aksi halde satıcılar yanlış profille ürün yayınlayamaz (Yüksek risk). Commit/push YAPILMADI.

## 📋 EK DURUM RAPORU (Claude — 2026-07-08, ikinci oturum)
> Faz 1 adım 3 (kategori→profil atama scripti) ve Faz 2 adım 2 (route wrapper) tamamlandı. **Asıl validation gate hâlâ bağlanmadı** — bu bilinçli, aynı risk gerekçesiyle: script canlı DB'ye karşı henüz hiç çalıştırılmadı (bu ortamdan production veritabanına güvenli bağlantı yoktu), o yüzden hangi kategorinin hangi profile düştüğü henüz doğrulanmadı. Gate'i bağlamadan önce scripti `--dry-run` ile çalıştırıp dağılımı gözden geçirmek şart.

## Faz 1 — Veri modeli ✅ TAMAMLANDI (adım 3 dahil)
- ✅ `apps/medusa-backend/src/compliance/compliance-profiles.json` — 15 profil: general_consumer_gpsr, electronics_weee, energy_labeled_eprel, battery_containing, cosmetics, food, food_supplement, toys, textiles, chemicals_reach, books_media, digital_goods, nicotine_tpd, medical_device (superuser_only), ce_marked_general. `inherits` zinciri + `field_definitions` (i18n label/help, type, validation_regex).
- ✅ `apps/medusa-backend/src/compliance/marketplace-overlays.json` — 9 overlay: EU, DE, FR, IT, ES, AT, NL, PL, SE. Ulusal kayıt alanları **KOŞULLU** (`requires_if_base_field`): örn. `weee_number_fr` yalnızca profil WEEE gerektiriyorsa zorunlu → "kitap WEEE ister" hatası çözüldü.
- ✅ `apps/medusa-backend/src/compliance/resolve-compliance.js` — `resolveComplianceProfile(profileId, marketplace)` (inheritance+overlay merge), `validateProductCompliance(meta, profileId, marketplace, {forPublish})`, `listProfiles()`, `listMarketplaces()`. Saf, bağımlılıksız. Test edildi (kitap+DE sadece GPSR; elektronik+FR weee_number_fr ister; kitap+FR istemez).
- ✅ **YENİ (2026-07-08)**: `apps/medusa-backend/scripts/assign-compliance-profiles.js` — kategori adı+slug'ında DE/EN/TR anahtar kelime araması (ör. "elektronik"/"electronic" → electronics_weee, "kitap"/"buch"/"book" → books_media), eşleşme yoksa parent→child inheritance, kök kategoride de eşleşme yoksa `general_consumer_gpsr`'a düşer. `--dry-run` (yazmadan önizleme), `--force` (var olanların üzerine yaz), `--csv path` (manuel prefix→profil override) destekliyor. **Henüz gerçek veritabanına karşı ÇALIŞTIRILMADI** — bu ortamdan production DB'ye güvenli/hızlı bağlantı yoktu (daha önceki oturumlarda da aynı sorun yaşandı). Kullanıcının kendi ortamından `node apps/medusa-backend/scripts/assign-compliance-profiles.js --dry-run` ile önce dağılımı görmesi gerekiyor.

## Faz 2 — Backend validation ⚠️ KISMEN (route wrapper hazır, gate hâlâ bağlı değil — bilinçli)
- ❌ `admin-products.js`: `validateRequiredGpsrMetadata` hâlâ TÜM ürünlerde koşulsuz çalışıyor (DEĞİŞTİRİLMEDİ — mevcut davranış korundu, kasıtlı). Kategori atamaları `--dry-run` ile doğrulanıp gerçek DB'ye yazılmadan bu adıma geçilmemeli.
- ✅ **YENİ (2026-07-08)**: `GET /admin-hub/categories/:id/compliance-schema?marketplace=DE` endpoint'i eklendi (`categories.js`). resolve-compliance.js'i sarmalıyor; kategori kendi `metadata.compliance_profile_id`'sini taşımıyorsa parent zincirini yukarı doğru gezip ilk atanmış profili buluyor, o da yoksa `general_consumer_gpsr`'a düşüyor. **Salt okunur** — hiçbir save/publish akışını etkilemiyor, güvenle deploy edilebilir. `medusa-admin-client.js`'e karşılık gelen `getCategoryComplianceSchema(categoryId, marketplace)` metodu da eklendi.
- ❌ Excel import validation.
- 📝 NOT: Kalan tek adım — kategori ataması `--dry-run` ile doğrulandıktan ve gerçek DB'ye yazıldıktan SONRA, `admin-products.js`'de `validateRequiredGpsrMetadata` çağrısını `validateProductCompliance(meta, resolvedProfileId, marketplace, {forPublish:true})` ile değiştirmek. Bunu şimdi yapmadım çünkü kategori ataması henüz canlıda doğrulanmadı — riski dosyanın kendi notuyla tutarlı şekilde erteledim.

## Faz 3 — Sellercentral UI ❌ YAPILMADI
- ❌ `ProductEditPage.jsx` sabit WEEE/EPREL/GPSR blokları duruyor; dinamik `ComplianceFieldsSection` yapılmadı.
- ❌ `ComplianceProfilesPage` (superuser, opsiyonel).

## Faz 4 — Shop gösterimi ❌ YAPILMADI
- ❌ `prop-labels.js` / `ProductTemplate.jsx` — mevcut "sadece dolu alanları göster" mantığı zaten var; EPREL QR tıklanabilir link vb. eklenmedi.

## Kabul kriterleri
- [ ] Kitap kategorisinde WEEE/EPREL GÖRÜNMEZ → ⚠️ Motor doğru çözüyor ama UI'ya bağlı değil (Faz 3).
- [ ] Elektronikte WEEE zorunlu, eksikse active olamaz → ⚠️ Motor doğru; backend gate bağlı değil (Faz 2).
- [ ] DE'de Almanca etiket uyarısı → ⚠️ Overlay'de `label_language:"de"` var; UI göstermiyor.
- [ ] 2. satıcı dolu GPSR tekrar istenmez → ❌ Yapılmadı.
- [x] `node --check` temiz + resolve motoru testli ✅
- [~] docs/COMPLIANCE.md → ❌ Ayrı dosya açılmadı; profil listesi + disclaimer bu JSON'ların `_meta` alanında.

## Değişen/eklenen dosyalar
- `apps/medusa-backend/src/compliance/compliance-profiles.json` (YENİ)
- `apps/medusa-backend/src/compliance/marketplace-overlays.json` (YENİ)
- `apps/medusa-backend/src/compliance/resolve-compliance.js` (YENİ)
- (admin-products.js compliance için DEĞİŞTİRİLMEDİ — sadece BRAND.md publish gate eklendi)

## Değişen/eklenen dosyalar (2026-07-08, ikinci oturum)
- `apps/medusa-backend/scripts/assign-compliance-profiles.js` (YENİ — henüz çalıştırılmadı)
- `apps/medusa-backend/src/routes/categories.js` (compliance-schema endpoint)
- `apps/sellercentral/src/lib/medusa-admin-client.js` (`getCategoryComplianceSchema`)

## Sıradaki adım (öneri, sırayla)
1. ~~Kategori→profil ataması: `admin_hub_categories.metadata.compliance_profile_id` + `assign-compliance-profiles.js`~~ **[Script YAZILDI, henüz ÇALIŞTIRILMADI]** — önce `node apps/medusa-backend/scripts/assign-compliance-profiles.js --dry-run` çalıştırıp dağılımı gözden geçirin, sonra `--dry-run` bayrağı olmadan gerçek yazımı yapın.
2. ~~`GET /admin-hub/categories/:id/compliance-schema` route wrapper~~ **[TAMAMLANDI]**
3. Faz 2 validation'ı **draft'ta kal, superuser override, needs_compliance_review flag** ile açmak — kategori ataması canlıda doğrulanmadan yapılmamalı.
4. Faz 3 UI.
> ⚠️ Bu bir hukuki tavsiye değildir; canlıya almadan önce avukat/compliance danışmanı doğrulaması şart (JSON `_meta.legal_disclaimer`).