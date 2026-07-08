# TASK: Brand Authorization Workflow (kayıtlı marka + fatura onayı)

## Bağlam
- Mevcut: `admin_hub_brands` — name, handle, logo, seller_id; onay YOK (`brands.js`)
- Mevcut: Satıcı marka oluşturur → anında aktif, shop'ta görünür
- Mevcut: `admin_hub_product_change_requests` + `admin_hub_notifications` onay pattern'i VAR (Görev 1/5'te kullanıldı)
- Hedef: Satıcı kayıtlı/tescilli bir marka adıyla satış yapacaksa, marka sahipliğini kanıtlayan fatura veya yetki belgesi yüklesin; superuser onaylayana kadar o markayla ürün yayınlanamasın

## Kavramlar
- **Own brand / tescilsiz** (`own`): Satıcının kendi oluşturduğu, henüz tescil ettirmediği marka → anında `active`, ancak `verification_level='unverified'`; marka koruma hakkı yok, başka satıcı aynı adı talep edebilir.
- **Own brand / tescilli** (`own_registered`): EUIPO / WIPO / Türk Patent / ulusal patent kurumuna kayıtlı marka → tescil numarası (`trademark_number`) + yetki alanı (`trademark_jurisdiction`) **zorunlu**; sertifika belgesi yüklenene kadar submit edilemez; superuser onaylayana kadar `pending` → onayda `verification_level='verified'`.
- **Authorized reseller** (`authorized_reseller`): Satıcı, başka markanın yetkili bayisi/distribütörü → yetki belgesi veya dağıtım anlaşması zorunlu; `pending` → onayda `verification_level='reseller'`.
- **Platform brand**: Superuser oluşturdu (herhangi bir type, direkt `active + verified`).

> **Neden tescilsiz marka belge gerektirmiyor?**
> Küçük satıcılar / private label ürünleri için erişim engeli kaldırmak adına tescilsiz marka anında aktif olur. Ancak marka koruma hakkı, uyuşmazlık çözüm mekanizması veya "Verified Brand" rozeti YOKTUR. Tescilli marka yaptırırlarsa `own_registered` ile upgrade edebilirler.

## YAP

### Faz 1 — Veri modeli
1. `admin_hub_brands` tablosuna kolonlar:
   - `status`: 'active' | 'pending' | 'rejected' | 'suspended' (default: own=active, own_registered/authorized_reseller=pending)
   - `brand_type`: 'own' | 'own_registered' | 'authorized_reseller'
   - `trademark_number`: nullable — EUIPO / WIPO / Türk Patent / ulusal tescil no. (**`own_registered` için zorunlu**)
   - `trademark_jurisdiction`: nullable — EUIPO, WIPO, DE, TR, FR... (**`own_registered` için zorunlu**)
   - `approved_at`, `approved_by`, `rejection_reason`
   - `verification_level`: 'unverified' | 'verified' | 'reseller' | null — marka doğrulama seviyesi

2. Yeni tablo: `admin_hub_brand_authorization_documents`
   - id, brand_id, seller_id, document_type ('purchase_invoice' | 'distribution_agreement' | 'trademark_certificate' | 'authorization_letter')
   - file_url (mevcut media/upload altyapısını kullan)
   - file_name, uploaded_at
   - status: 'pending' | 'approved' | 'rejected'
   - reviewer_id, reviewer_note, reviewed_at

3. Yeni tablo veya mevcut notifications'a tip ekle:
   - `brand_authorization_pending` — superuser'a bildirim

### Faz 2 — Backend API (`apps/medusa-backend/src/routes/brands.js` genişlet)
1. `POST /admin-hub/brands` değişikliği:
   - body'de `brand_type: 'own_registered'` → `trademark_number` + `trademark_jurisdiction` **body'de zorunlu** + sertifika belgesi upload zorunlu → status = 'pending'
   - body'de `brand_type: 'authorized_reseller'` → yetki belgesi upload zorunlu → status = 'pending'
   - body'de `brand_type: 'own'` (default) → status = 'active', `verification_level='unverified'`

2. `POST /admin-hub/brands/:id/authorization-documents`
   - Multipart veya media URL ile belge yükleme
   - En az 1 belge: purchase_invoice VEYA trademark_certificate

3. Superuser endpoints:
   - `GET /admin-hub/brands/pending-authorizations`
   - `POST /admin-hub/brands/:id/authorization/approve` → brand status = active, `verification_level = 'verified'` (own_registered) veya `'reseller'` (authorized_reseller)
   - `POST /admin-hub/brands/:id/authorization/reject` → status = rejected, reason

4. Ürün publish gate (`admin-products.js`):
   - `brand_id` set edilmişse ve brand.status !== 'active' → 400 "Brand authorization pending"
   - Seller sadece kendi approved brand'lerini veya platform brand'lerini kullanabilir

### Faz 3 — Sellercentral UI
1. `BrandPage.jsx` genişlet:
   - Marka oluştururken: "Kendi markam" vs "Tescilli marka (yetki gerekli)" seçimi
   - Registered seçilirse: fatura/yetki belgesi upload alanı (PDF/JPG)
   - Pending durumda: sarı banner "Onay bekleniyor"
   - Rejected: kırmızı banner + sebep + yeniden yükleme

2. `ProductEditPage.jsx`:
   - Brand dropdown: sadece `status=active` markalar
   - Pending marka gri/disabled + tooltip

3. Superuser panel (yeni sayfa veya mevcut admin hub):
   - `BrandAuthorizationsPage`: bekleyen listesi, belge önizleme, approve/reject
   - Mevcut `seller_listing_pending` notification pattern'ini kopyala

### Faz 4 — Shop
- `status !== 'active'` markalar shop `/brands` listesinde görünmesin
- O markayla bağlı ürünler zaten active olamaz (backend gate)

## İş kuralları
1. Aynı marka adına birden fazla satıcı claim edebilir → ilk onaylanan "primary", diğerleri distribution_agreement ister
2. Superuser mevcut Nike/Apple gibi bilinen markaları "reserved" olarak işaretleyebilir → sadece superuser atayabilir
3. Fatura minimum gereksinimleri: satıcı adı/şirket adı, marka adı, tarih (son 12 ay), tedarikçi bilgisi
4. Belge dosyaları GDPR: sadece superuser + ilgili satıcı görebilir, public URL olmamalı

## Kabul kriterleri
- [ ] `own` (tescilsiz) → anında active, `verification_level='unverified'`, belge gerekmez
- [ ] `own_registered` → `trademark_number` + `trademark_jurisdiction` body'de yoksa 400; sertifika yüklemeden submit edilemez (UI kuralı); backend pending oluşturur
- [ ] `authorized_reseller` → yetki belgesi yüklemeden submit edilemez (UI kuralı); backend pending oluşturur
- [ ] Superuser approve → brand active, `verification_level` uygun değere set (own_registered → verified, authorized_reseller → reseller)
- [ ] Pending brand ile ürün publish → 400 hata
- [ ] Superuser notification `brand_authorization_pending` görünür
- [ ] Mevcut markalar migration: status='active', brand_type='own', verification_level='unverified'

## Dosyalar
- apps/medusa-backend/src/routes/brands.js
- apps/medusa-backend/src/routes/admin-products.js (brand gate)
- apps/medusa-backend/src/routes/notifications.js (yeni tip)
- apps/sellercentral/src/components/pages/BrandPage.jsx
- apps/sellercentral/src/components/pages/admin/BrandAuthorizationsPage.jsx (yeni)
- apps/sellercentral/src/lib/medusa-admin-client.js

## Risk
- Orta: mevcut markalar etkilenmemeli (migration default active)
- Düşük: upload güvenliği — private bucket veya signed URL

---

# 📋 DURUM RAPORU (Claude — 2026-07-08)

> Backend tam kuruldu, non-breaking. Sellercentral UI + shop UI bekliyor. Commit/push YAPILMADI.
> **2026-07-08 revizyonu**: brand_type modeli düzeltildi — tescilsiz kendi markası ≠ belge gerekmez, ≠ doğrulanmış; `own_registered` zorunlu alanlar + `verification_level` eklendi.

## Faz 1 — Veri modeli ✅ YAPILDI (güncel)
- ✅ `admin_hub_brands` kolonları: `status`, `brand_type`, `trademark_number`, `trademark_jurisdiction`, `approved_at`, `approved_by`, `rejection_reason` — server.js startup ALTER.
- ✅ **YENİ (2026-07-08)**: `verification_level varchar(20)` kolonu eklendi. Değerler: `'unverified'` (tescilsiz kendi marka) | `'verified'` (tescilli onaylandı) | `'reseller'` (yetkili bayi onaylandı) | NULL (pending/rejected).
- ✅ Migration non-breaking: mevcut markalar `status='active'`, `brand_type='own'`, `verification_level='unverified'`. Eski `brand_type='registered'` → `'own_registered'`'a rename.
- ✅ Yeni tablo `admin_hub_brand_authorization_documents` + index.

## Faz 2 — Backend API ✅ YAPILDI (güncel)
- ✅ `POST /admin-hub/brands`: 
  - `own` → active + `verification_level='unverified'` (tescil belgesi gerekmez, marka koruma yok)
  - `own_registered` → **`trademark_number` ve `trademark_jurisdiction` body'de zorunlu** (eksikse 400); `pending`, `verification_level=null`
  - `authorized_reseller` → `pending`, `verification_level=null`
  - Superuser: her type'ı direkt `active + verified` oluşturur.
- ✅ `POST /admin-hub/brands/:id/authorization-documents` — belge yükleme (file_url ile). Mevcut MediaPicker akışıyla uyumlu.
- ✅ `GET /admin-hub/brands/pending-authorizations` (superuser) — bekleyen markalar + belgeler.
- ✅ `POST /admin-hub/brands/:id/authorization/approve` → status=active, `verification_level` set (own_registered→'verified', authorized_reseller→'reseller').
- ✅ `POST /admin-hub/brands/:id/authorization/reject` → status=rejected + reason.
- ✅ Bildirimler: `brand_authorization_pending` (superuser'a, türe göre farklı mesaj), `brand_authorization_reviewed` (satıcıya).
- ⚠️ GEREKLİ: `own_registered` için belge yükleme (trademark_certificate) backend'de validate edilmiyor — "sertifika olmadan submit edilemez" kuralı UI'da uygulanmalı (UI kısıtı).

## Faz 3 — Sellercentral UI ❌ YAPILMADI (gerekli)
- ❌ `BrandPage.jsx`: "Kendi markam" vs "Tescilli marka" seçimi, registered'da fatura/belge upload alanı, pending sarı banner, rejected kırmızı banner+sebep+yeniden yükleme.
- ❌ `ProductEditPage.jsx`: Brand dropdown yalnızca `status='active'` markaları göstermeli; pending gri/disabled+tooltip.
- ❌ Yeni `BrandAuthorizationsPage.jsx` (superuser): bekleyen liste, belge önizleme, approve/reject. `seller_listing_pending` notification pattern'i kopyalanacak.
- ❌ `medusa-admin-client.js`: yeni endpoint metodları (getPendingBrandAuthorizations, uploadBrandAuthDoc, approve/rejectBrandAuth).
- 📝 NOT: Backend hazır; UI bunları çağırması yeterli. Endpoint sözleşmeleri yukarıda.

## Faz 4 — Shop ✅ KISMEN YAPILDI
- ✅ `GET /store/brands` artık yalnızca `status='active'` (veya NULL=legacy) markaları döndürüyor (`store-products.js`). Pending/rejected markalar shop `/brands` listesinde görünmez.
- ✅ Ürün publish gate zaten Faz 2/backend'de: pending marka ile publish → 400 (bkz. admin-products.js `validateBrandForPublish`).

## Kabul kriterleri
- [x] `own` (tescilsiz) → anında active, `verification_level='unverified'` ✅ (backend)
- [x] `own_registered` → `trademark_number`+`trademark_jurisdiction` zorunlu, yoksa 400 ✅ (backend)
- [~] `own_registered` → sertifika belgesi yüklemeden submit edilemez → ⚠️ UI katmanında uygulanmalı (backend belge ayrı endpoint)
- [~] `authorized_reseller` → yetki belgesi zorunlu → ⚠️ aynı şekilde UI katmanında
- [x] Superuser approve → brand active + verification_level set ✅ (backend)
- [x] Pending brand ile ürün publish → 400 ✅ (`admin-products.js` gate)
- [x] Superuser notification `brand_authorization_pending` ✅
- [x] Mevcut markalar migration: status='active', brand_type='own', verification_level='unverified' ✅

## Değişen dosyalar
- `apps/medusa-backend/server.js` (schema)
- `apps/medusa-backend/src/routes/brands.js` (API)
- `apps/medusa-backend/src/routes/admin-products.js` (publish gate)
- `apps/medusa-backend/src/routes/store-products.js` (shop /brands filter)

## Sıradaki adım (öneri)
Faz 3 sellercentral UI — backend sözleşmeleri hazır. Önce `medusa-admin-client.js` metodları, sonra `BrandPage.jsx` genişletme, sonra superuser `BrandAuthorizationsPage.jsx`.