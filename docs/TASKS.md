# Andertal — açık görevler

---

## TASK-1 — Sipariş → Versand akışı (EKSİK / NETLEŞTİR)

**Durum:** Kullanıcı notu yarım kaldı. Uygulamadan önce netleştir veya aşağıdaki varsayılan hipotezi doğrula.

**Ham not:**
> sellercentralde bir siparise versand diyorum. shipping sayfasinda …

**Varsayılan hipotez (doğrulanmalı):**
Sellercentral’da bir siparişe “Versand” denince sipariş `/orders/shipping` (Versand) sayfasında doğru görünmeli / işlenebilmeli. Şu an akış kopuk veya eksik olabilir (`sessionStorage` `versand_orders`, `VersandPage.jsx`, sipariş detayındaki Versand aksiyonu).

**Kabul kriterleri (hipotez doğruysa):**
- [ ] Sipariş listesi veya detaydan Versand’a gönderilen sipariş(ler) Versand sayfasında listelenir.
- [ ] Sayfa yenilense / başka sekmeden gelse beklenen davranış net ve tutarlıdır (gerekirse URL query veya backend state; kırılgan `sessionStorage`-only yetmezse düzelt).
- [ ] Seller yalnızca kendi satır kalemlerini görür / gönderir (TASK-5 ile uyumlu).

**İlgili dosyalar (başlangıç):**
- `apps/sellercentral/src/components/pages/VersandPage.jsx`
- Sipariş detay / listede Versand aksiyonunu tetikleyen bileşenler
- `apps/sellercentral/src/lib/ship-*.js`

**Not:** Kullanıcıdan eksik cümleyi tamamlatmadan büyük refactor yapma.

---

## TASK-2 — Speichern toast’ları viewport’ta sabit görünsün

**Problem:**
Sellercentral’da Speichern sonrası başarı/hata bildirimi sayfanın en üstünde (document top) çıkıyor. Kullanıcı sayfanın altındayken scroll etmeden toast’ı göremiyor.

**Hedef:**
Toast / banner, sayfanın neresinde olursa olsun **viewport içinde** (ekranın üstünde veya görünür köşede) sabit görünsün.

**Kabul kriterleri:**
- [ ] Uzun bir ayar/içerik sayfasının en altına scroll edip Speichern → toast viewport’ta görünür; `window.scrollTo(0)` zorunlu olmasın.
- [ ] Success ve error (critical) aynı davranır.
- [ ] Polaris `Frame` / `Toast` kullanılıyorsa `position: fixed` / Frame toast slot’u doğru bağlanmış olsun; sayfa-içi absolute banner varsa fixed’e çek.
- [ ] Mevcut toast metinleri ve süreleri bozulmasın.

**İlgili alanlar:**
- `PolarisLayout.jsx` (`toastMarkup`, Frame)
- Sayfa lokal toast’lar (ör. `FlowsPage`, settings sayfaları, `onToast` kullanan paneller)
- Ortak bir toast helper varsa onu düzelt; yoksa tutarsız banner’ları Frame toast’a taşımayı tercih et.

---

## TASK-3 — Lieferschein şablonları = Rechnung şablonları seviyesi

**Problem:**
Rechnung (invoice) PDF/şablon sistemi ayarlanabilir / zengin; Lieferschein (delivery note) geride kalmış.

**Hedef:**
Lieferschein şablonlarını Rechnung ile **aynı model ve kalitede** hizala (ayarlar, alanlar, marka/logo, dil, PDF üretimi).

**Kabul kriterleri:**
- [ ] Rechnung’ta olan şablon ayarları / editör / varsayılanlar Lieferschein için de mevcut (veya bilinçli olarak paylaşılan ortak layout + Lieferschein’e özgü alan farkları belgelenmiş).
- [ ] Siparişten Lieferschein PDF indirme / yazdırma Rechnung ile tutarlı görünür.
- [ ] Versand sayfasındaki toplu Lieferschein yazdırma (`buildShipLieferscheinHtml` / backend PDF) yeni şablonla uyumlu.
- [ ] Locale (de/en/tr/…) bozulmaz.

**İlgili alanlar:**
- Invoice template ayarları + PDF pipeline (sellercentral + `medusa-backend` order PDF)
- `apps/sellercentral/src/lib/ship-print-html.js`
- `apps/sellercentral/src/lib/order-pdf-url.js` (`kind: "lieferschein"`)
- Backend Lieferschein PDF üretimi (Rechnung karşılığı)

---

## TASK-4 — Customer Support (shop + sellercentral) uçtan uca

**Özet:** Shop’ta müşteri Support merkezi; sellercentral’da scoped case inbox; siparişten ürün seçerek case; kapalı case mesaja reopen.

### 4.1 Shop — menü ve sayfa adı
- [ ] Shop menü / hesap linkindeki **Nachrichten** adı **Support** olsun (locale: de/en/tr/fr/es/it mesaj dosyaları).
- [ ] Route kullanıcıya “Support” olarak görünsün; eski `/nachrichten` kırılmasın (redirect veya aynı sayfa alias).
- [ ] Sayfa hesabın **sol sidebar** layout’u içinde açılsın; dağınık full-page inbox olmasın.

### 4.2 Shop — Customer Support landing + yeni ticket
- [ ] Sellercentral’da tanımlı **customer-support** landing page içeriği shop’ta yayınlansın / çalışsın (`/pages/...` veya Support landing component).
- [ ] Müşteri buradan **yeni support ticket** açabilsin (kategori/alt kategori, metin, ek).
- [ ] Açılan tüm case’ler müşterinin Support inbox’ında listelensin.

### 4.3 Shop — siparişten Nachricht = support case
- [ ] Orders / sipariş detayındaki **Nachricht** → önce **ürün seçimi** → support case oluşturulsun (eski `store_messages` product_id required akışına düşmesin).
- [ ] Case Support inbox’ta açılsın (`?case=<id>`).

### 4.4 Shop — kapalı case reopen
- [ ] `resolved` / `closed` case’e müşteri (veya karşı taraf) mesaj atınca case **yeniden açılsın** (reopened); mesaj reddedilmesin.

### 4.5 Sellercentral — Inbox sekmeleri
- [ ] **Seller:** iki sekme — (1) Müşteri case’leri (yalnızca kendi `seller_id`) (2) Seller ↔ platform support (eski davranış kalabilir).
- [ ] **Superuser:** iki sekme — (1) Müşteriden gelen (2) Seller’dan gelen; süperuser hepsini görür.
- [ ] Seller, başka seller’ın case / mesajlarını **görmez**.
- [ ] Kunden sekmesinde müşterilerin yazdığı support ticket’lar gerçekten listelenir (boş / eksik API sorunu varsa düzelt).
- [ ] Çözülen case’ler UI’da **gelöst / resolved** olarak kategorize edilsin.

**İlgili alanlar:**
- `apps/shop` — `nachrichten`, Support landing, account layout, i18n (`messages/*.json`)
- `apps/sellercentral` — `InboxPage`, `SupportCaseInbox`
- `apps/medusa-backend` — `support-cases.js`, `support-case-core.js`, legacy messages bridge
- Landing: customer-support CMS / `setup-customer-support-landing.js`

**Not:** Bu alanda kısmi iş yapılmış olabilir. Önce mevcut davranışı smoke-test et; çalışan parçayı bozmadan boşlukları kapat.

---

## TASK-5 — Sipariş detayında yalnızca kendi ürünleri + ürün ekleme araması

### 5.1 Seller sipariş izolasyonu
**Problem:** Multi-seller sepette sipariş başlığı `default` olabilir; A seller’ı B’nin satırlarını görüyor → kafa karışıklığı + şişmiş tutar/komisyon.

**Hedef:**
Non-superuser seller sipariş listesi/detayında **yalnızca kendi sattığı kalemleri** görsün; tutar/komisyon kendi kalemlerine göre olsun; Versand/scan yalnızca kendi SKU’ları.

**Kabul kriterleri:**
- [ ] Seller A, B’nin kalemlerini detayda görmez.
- [ ] Gösterilen ara toplam / komisyon tabanı A’nın kalemleriyle uyumlu.
- [ ] Superuser tüm kalemleri görmeye devam eder.
- [ ] Backend zorunlu filtre (yalnızca UI gizleme yetmez). Ownership: `store_order_items.seller_id` (+ legacy fallback); `o.seller_id = 'default'` sahiplik sayılmaz.

### 5.2 Siparişe ürün ekleme (Hinzufügen)
**Problem:** Rastgele metin yazıp Hinzufügen kabul edilebiliyor.

**Hedef:**
Yalnızca geçerli eşleşme eklensin: **EAN**, **SKU** veya **ürün adı** araması; yazıldıkça **dropdown** öneriler.

**Kabul kriterleri:**
- [ ] Serbest/rastgele string → reddedilir (net hata mesajı).
- [ ] EAN / SKU / title ile typeahead; listeden seçim veya net tek eşleşme gerekir.
- [ ] Seller yalnızca kendi satabileceği / yetkili olduğu ürünleri ekleyebilir (superuser ayrı kural).

**İlgili alanlar:**
- `apps/medusa-backend/src/routes/orders.js`, `order-items-seller.js`, `seller-scope.js`
- Sellercentral sipariş detay — kalem listesi + Hinzufügen UI

---

6) sellercentralde content/pages sayfasinda düzenlenen sayfa en üstte olmasin. en son eklenen en üstte olsun. alfabetik olarak da siralayabilelim.
7) content/menus sayfasinda menüeinträge kismina ekledigmiz menü itemleri her dile göre yazabilelim. su an yazilanlar her dilde gözükecek. böyle olmamali
8) sayfada bir sürü kategori ve subkategori var. ben bunlari tek tek dillerine ceviremem. 20000 den fazla var. senden ricam bunlari shopta secilen dilde göstermen. mesela bizim kategorimiz var adi "Home". benim isim burada bitsin. müsteri türkce dili secerse shopta "Ev" görsün. bunu ayarla
