1) ✅ Yapıldı — Shopta product card ve product sayfasinda üründe indirim var ise yaninda indirim yüzdesinin göründügü bi balon aciliyor. kirmizi olmali o balon. ürün fiyati cizili olacak indirim fiyati kirmizi olacak.


7) ✅ Yapıldı (düzeltme 2026-08-12) — Marken `/brands`: CMS `brands_directory` (eski boş `seller_carousel` artık aynı Marken-Raster’ı boyar) = arama + A–Z + 5×10 kart grid. Content→Pages Seiteninhalt (richtext) `CatalogCmsLanding` içinde her zaman container’ların EN ALTINDA.


10) ✅ Yapıldı — Lieferscheinda faturada siparisler sayfasinda ve emaillerde ürün isminin yaninda varyasyonlar parantez icinde gözükmesin. yine yaninda alsin ancak daha acik renkli ufak puntoda not seklinde düssün
11) ✅ Yapıldı — bi sipariste sendungsnummer yok henüz. lieferschein drucken diyorum sendungsnummer cikiyor. sacma :D sendungsnummer tek satira sigmali ve logo tam ortada o kadar büyük görünmemeli evraklarda.


14) ✅ Yapıldı — yeni acilan seller hesaplari neden to-do listte bu sayfaya yönlendiriliyor?: settings/stripe-connect sellerlarin stripe ile yapacaklari bir sey yok hatta bir sey yapamamalilar. erisememeliler.
15) ✅ Yapıldı — sellercentralde settings sayfasinda soldaki menülerden de yalnizca superuser in görebildiklerini kirmizi yap.
16) ✅ Yapıldı (izolasyon zaten güvenliydi, sadece amaç etiketleri eklendi) — settings/locations sayfasindaki icerikler her seller in kendine özel olacak. baska sellerlar göremeyecek. add location dendiginde ya da mevcut location düzenlenmek istendiginde o adresin ne amacla kullanilacagi secilebilsin. Siparislerin kargolandigi adres, iadelerin gelecegi adres, fatura adresi vs ayri ayri secilebilsin. bir adrese her biri tanimlanabilsin ancak tercihe göre her biri icin ayri bir adres de belirlenebilir.
17) ✅ Yapıldı — DAC7 / § 12 PStTG sayfasına kısa kılavuz eklendi (nedir, kim, ne zaman, adımlar, ne yapmaz) + rapor aracı aynı kaldı.
18) ✅ Yapıldı — settings/general sayfasinda kendini tekrar eden bölümler var. mesela iki defa adres giriliyor, iki defa sirket bilgileri giriliyor falan. burada da iban yazma kismi var falan. iban baska yerden yaziliyor ama... düzenle burayi.
19) ✅ Yapıldı — settings/security sayfasinda konto seit kismi bos. doldur. yeni sifre belirleme kisminda yazilanlari gösterme butonu ekle.
20) ✅ Yapıldı — settings/payments sayfasinda So funktionieren Auszahlungen altinda Auszahlung (88%) yaziyor. 88% neden var? kaldir. kafa karismasin.
21) ✅ Yapıldı (DE/NL/ES zaten varsayılan açık, ürün sayısı gösteriliyor) — settings/shipping sayfasinda Länder bölümü var. orada ülkelere satislarin acik mi olacagini kapali mi olacagini ayarlayabiliyoruz. anack orada yalnizca müsterilerin girdigi ülkeler görünüyor. tüm ülkeler gözükmeli. Lieferländer auswählen bölümünde gözüktügü gibi olmali ve yaninda acip kapama olmali. sen bunu ayarla ve simdilik almanya, hollanda, ispanya sec. yanlarinda o ülke icin kac ürün secildigi var. onlari daha detayli göstermeyi unutma.
22) ✅ Yapıldı — pricing/SEO/metafield/varyasyon UX + VariantEditPage alanları + GPSR varyant kilidi tamamdı. Ayrı ürünleri tek parent altında birleştirme: Inventory’de 2+ seç → Combine as variants; POST /admin-hub/v1/products/combine-as-variants (kaynaklar status=merged).
23) ✅ Yapıldı — Ürün/sipariş küçük resimleri + hover + shop linki tamamlandı. ActionMenu Polaris Popover/ActionList; ManualOrderModal Polaris Modal + TextField/Select.
24) ✅ Yapıldı — kök neden: login durumuyla ilgisi yoktu (kategori listesinde hiç auth kontrolü yoktu). Kategoriler tek seferlik bir fetch ile geliyor; menüyü sayfa yüklenir yüklenmez açarsan (ya da fetch başarısız olursa) kategori bölümü DOM'dan tamamen kayboluyordu, geriye sadece hesap bölümü (login iken "Mein Konto", logout iken "Anmelden/Registrieren") kalıyordu — bu da login'e bağlıymış gibi görünüyordu. Şimdi fetch tamamlanana kadar kategori bölümü placeholder (shimmer) gösteriyor, kaybolmuyor. Merkzettel notu: gerçek bir guest-wishlist yok, gördüğün şey login'e yönlendirmeden önceki tek karelik "boş liste" anı (FOUC), ayrı bir konu. — mobilde soldan sidebar kategoriler gelsin diye altaki menü butonuna basiyorum ancak anmelden registrieren diyor. orada menü itemler gözükmeliydi. BOZMA BIR SEYI. Login olunca gözüküyor ancak logoutken de göözükmeli. login olmamis biri nasil merkzettel görebiliyor onu tam anlamadim ben :D

25) Satıcılar için zorunlu: Gebühren (platform ücretleri) için kredi kartı ekleme + Auszahlung (ödeme) için IBAN ekleme. İkisi de mutlaka girilmeli; eksikse onboarding/to-do ve ilgili settings (payments / billing) net uyarmalı, satışa açılmadan tamamlanmış sayılmamalı.

26) settings/shipping’den Retouren adresi bölümü kaldırılacak (kaldırıldı). Retoure / Lager / Fatura adresleri yalnızca settings/locations (Standorte) üzerinden girilir ve zorunludur; locations değerleri esas alınır. Zorunlu kurulum kalemleri (Standorte 3 amaç + kredi kartı + IBAN) seller detay sayfasından kontrol edilebilir olmalı.

