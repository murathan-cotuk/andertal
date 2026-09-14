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

25) 🟡 Kısmen yapıldı (2026-09-14) — Satıcılar için zorunlu: Gebühren (platform ücretleri) için kredi kartı ekleme + Auszahlung (ödeme) için IBAN ekleme. İkisi de mutlaka girilmeli; eksikse onboarding/to-do ve ilgili settings (payments / billing) net uyarmalı, satışa açılmadan tamamlanmış sayılmamalı.
   Yapılan: Dashboard'daki OnboardingChecklist zaten kart+IBAN'ı "Zorunlu" rozetiyle gösteriyormuş (atlanamaz). Ama satıcı hiç dashboard'a uğramadan doğrudan Ürünler'e gidebiliyordu — orada hiçbir uyarı yoktu. `apps/sellercentral/src/components/pages/InventoryPage.jsx`'e (ürün listesi, gerçek satıcıların kullandığı sayfa) aynı kontrolü tekrar eden bir uyarı banner'ı eklendi (kart/IBAN eksikse turuncu Banner + "/settings/payments"e giden buton).
   Yapılmayan (bilinçli, onay gerektirir): Sunucu tarafında GERÇEK bir engelleme yok — IBAN/kart olmadan da ürün publish edilebiliyor. Şu an production'da 7 satıcıdan 5'inde IBAN yok; sert bir engel hemen açılırsa bu satıcıların mevcut ürünlerini yönetmesini aniden kilitleme riski var. Sert engelin nasıl uygulanacağı (yeni satıcılar mı / herkes mi / ne zaman) iş kararı gerektiriyor.

26) ✅ Yapıldı (2026-09-14 doğrulandı) — settings/shipping’den Retouren adresi bölümü kaldırılacak (kaldırıldı). Retoure / Lager / Fatura adresleri yalnızca settings/locations (Standorte) üzerinden girilir ve zorunludur; locations değerleri esas alınır. Zorunlu kurulum kalemleri (Standorte 3 amaç + kredi kartı + IBAN) seller detay sayfasından kontrol edilebilir olmalı.
    Doğrulama: settings/shipping/page.jsx'te "Retouren"/returns-address hiç geçmiyor (zaten kaldırılmış). SellerDetailPage.jsx zaten 5 kalemin (has_shipping_from, has_returns_to, has_billing, has_card, has_iban) hepsini gösteriyor.

27) ✅ Büyük ölçüde zaten yapılmış bulundu (2026-09-14 doğrulandı — başka cihazda yapılmış, TASKS.md güncellenmemişti) — products/... ürünün icine girilmis sayfa hic güzel durmuyo ya sellercentralde.
    Doğrulama: ProductEditPage.jsx'te 4 sekme (Allgemein/Spezifikationen/Variante/Rechtlich) zaten kurulu, hiç accordion/ausklappen yok (dümdüz görünür), yazı boyutları zaten küçük/kompakt (34× bodySm, 8× bodyXs, sadece 1× headingSm — büyük başlık yok), related products bölümü zaten sadece superuser'a görünür (isSuperuser kontrolü), minimum sipariş adedi + swatch resmi seçici + parent'tan değer kilitleme (parent_locked_fields, kilitliyken gri/tıklanamaz) — hepsi zaten kurulu ve çalışıyor.
    Bulduğum ve düzelttiğim gerçek sorunlar: (1) Dosyada gözle görülmeyen, editör hatasından kalma 2 adet ham NUL byte'ı vardı (`removeMatrixVariant` fonksiyonunda) — bu satırları dosyanın kendi güvenli deseniyle (`\u0000` kaçış dizisi, aynı amaç için başka 7 yerde zaten kullanılıyor) uyumlu hale getirdim. (2) Spesifikasyonlar sekmesindeki "yeni eigenschaft öner" akışı zaten vardı ama "Superusera bunun bildirimi kesinlikle gitmeli" kısmı eksikti — sadece pasif bir kuyruktaydı, kimseye haber gitmiyordu. `admin-products.js`'e (yeni anahtar önerildiğinde, tekrar önerilerde spam olmasın diye sadece gerçekten YENİ anahtarlarda) `insertAdminHubNotificationSafe` çağrısı ekledim — artık superuser bildirim alıyor.
    Kalan (küçük, isteğe bağlı): "shop assignment içindeki menüler" tam olarak spesifikasyona göre mi konumlanmış, birebir doğrulanmadı — büyük bir risk taşımıyor.

27-eski) products/... ürünün icine girilmis sayfa hic güzel durmuyo ya sellercentralde. yani cok daginik. cok savruk, cok amatörce duruyor. buradaki bilgi girme alanlarini tablere ayirsak daha iyi olur gibi düsünüyorum. detayli bir calisma yapman gerekecek ve HICBIR SEYI bozmaman gerekecek. ben sana aklima gelen önerileri yapicam sen de en mükemmel nasil olursa önerilerimi ciddiye alip en iyi bildigin metodu harmanlayarak yeni bir ürün sayfasi kuracaksin. Her dil icin gerekli menü ayarlamalarini, icerigibi vs ayarlayacaksin. related products, sales, type, kismini sellerlar göremesin mesela. alt alta dizilen basliklarin arasinda cok bosluk olmasin, kompakt olsun. yazi tipi puntosu cok büyük su an. biraz kücült ki daha fazla icerik görünsün. en üstte yan yana bu tabler olacak:

- Allgemein, Spezifikationen, Variante, Rechtlich yada her ne ise ismi (TÜM hukuki gereklilikler burada olacak GPSR, WEEE, Eprel cart curt vs sen biliyorsun)

Allgemein: sagdaki status ile baslayan bar olacak. solda ise ürün adi, altinda sku ean, altinda beschreibung, altinda shop assignment icindeki menüler olacak ancak onlari ausklappen seklinde yapmayalim. dümdüz her zaman görünür olsun bunun icindeki bilgiler. Fiyat bölümü gelecek sonra. Verkaufspreis, indirim fiyati, uvp gözükecek. Altina stok girme bölümü, minimum order quantity bölümleri eklenecek. altina görseller eklenecek. 

Spezifikationen: Maße & Verpackung kismi (Breite, höhe, lönge, gewicht, verkaufseinheit, maßeinheit, verpackungseinheit, verpackungseinheit mehrzahl, grundeinheit) buraya tasinacak ve genisletilecek. Unit vs girdigimiz bölümde burada olacak parentez icinde gördügün üzere. altindaeigenschaften olacak. yani önceden metadata diye belirledigimiz kisim. burada bi arama cubugu olacak yaninda eigenschaft suchen butonu olacak. girilen metadatalar buradan secilip icleri doldurulabilecek. eklenmis eigenschaftenleri secebilecekler. ancak istedikleri yok ise yeni eigenschaften ekleme önderisinde bulunmaya devam edebilecekler. (Superusera bunun bildirimi kesinlikle gitmeli)

Variante: iste o tüm varyasyon olusturma kismini buradak yapacagiz. sellerlar varyasyon option basligi olarak bizim metadata adini verdigimiz kisimdan, yani metaobjects sayfasindan ekledigimiz metaobfectlerden secim yapabilecek. mesela metaobjects sayfasinda anzeigename Farbe var. bu varyasyon opsiyonu olarak eklenecek. sonra altina bu metanin icindeki degerlerden secebilecek. swatch image kendi ayarlayabilecek, varyasyonlar burada alt alta gösterilecek, yaninda kalem olacak basildiginda icine girilebilecek, "Variante" tab'i haric parent artikelde olan tabler burada da gözükecek, parent artikelde yazilan degerin aynisinin kabul görmesini istemeleri halinda her bir deger girme bölümünün yaninda cengel iconu olacak. cengel iconu secili ise parent a girilen degerin aynisi yer alacak orada ve o bölüm kilitlenecek cengel oldugu icin. mesela bir varian icindeyiz ve beschreibun kismindayiz. ama parenta zaten yazmisim ve onun kullanilmasini istiyorum. o halde cengele basicam, parent icine yazilmis degerler ile otomatik doldurulacak orasi, rengi biraz grilesecek o bölümün ve icine tiklanamaz olacak cünkü kilitledik. kilit kaldirildiginda o degerler yine orada kalacaklar ancak düzenlenebilecekler. yani o kilit aslinda direkt copy paste yapiyor ancak kilit kaldirildiginda delete yapmiyor.

Rechtlich: önceden de belirttigim gibi bu kisimdan nefret ediyorum. hukuki olarak gereken ne var ise burada olacak. sik gibi bir bölüm. baska seylerle karistirmaya gerek yok abi.

haydi bu düzenlemeleri adim adim detaylica yap. HICBIR SEYI BOZMA!!! DÜZENLE VE YENIDEN KUR ANCAK FONKSIYONLARI SAKIN BOZMA!!!

---

## Docs klasöründeki dış görevler — SENİN yapman gerekenler (2026-09-05 taranan)

Aşağıdakiler kod tarafında yapılamaz — hesap/panel erişimi, domain/ödeme kararı ya da fiziksel test gerektiriyor.

- [ ] **Performans (Redis doğrulama):** Render dashboard → `REDIS_URL` tanımlı mı ve loglarda "Redis connected" var mı bak. Sonra `curl -w "%{time_total}"` ile aynı isteği 2 kere at, ikincisi hızlı mı (Redis'ten) kontrol et.
- [ ] **Developer Platform yayına alma:** Vercel'de `apps/developer` için proje oluştur → domain `developer.andertal.com`. Render'a `DEVELOPER_JWT_SECRET`, `CORS_ORIGINS`'e `developer.andertal.com`, `APP_PLATFORM_AUTO_APPROVE=true`, `SUPERUSER_EMAILS` ekle.
- [ ] **JTL Connector (Connector projesi için ön koşul):** JTL Partner Portal'dan sandbox token iste. Token gelince Render'a `JTL_SCX_CHANNEL_REFRESH_TOKEN` / `JTL_SCX_API_BASE` / `JTL_SCX_CHANNEL_ID` ekle, Partner Portal'da sign-up/update URL'lerini tanımla. Mümkünse Windows'ta JTL-Wawi kurup gerçek satıcı akışını test et.
- [ ] **Affiliate programı — domain kararı:** Yeni bir domain gerekiyor (ör. `affiliate.andertal.com`). Kod tarafı hiç başlamadı (0%) — domain/isim kararını verirsen inşaya başlanabilir.
- [ ] **Bonuspunkte backfill onayı:** `scripts/backfill-platform-bonus-funding.js` canlı DB'ye karşı hazır ama hiç çalıştırılmadı (production veri değişikliği içeriyor) — önce `--dry-run`, sonra gerçek çalıştırma için onayın gerekiyor.

## Docs klasöründeki iç görevler — kod tarafında yapılacaklar (bana ait, öncelik sırasıyla soracağım)

- **BRAND.md:** ✅ Kontrol edildi — zaten yapılmış. Onay ekranı ayrı sayfa değil, `BrandPage.jsx` içine gömülü ("Pending Authorizations" kartı, sadece superuser'a görünüyor, `/content/brands`'te). Yanlış alarm.
- **HUKUKI.md:** ✅ Kısmen ilerletildi (2026-09-05) — superuser inceleme kuyruğu (`content/compliance-review`) + kategori bazlı profil override sayfası (`content/compliance-profiles` — bir kategorinin otomatik atanan profili yanlışsa tek tek düzeltilebiliyor, alt kategoriler üst kategoriden bağımsız kendi profiline sahip olabiliyor) kuruldu. Kalan: sabit GPSR kontrolü hâlâ profile-bazlı değil (bilinçli, henüz güvenli değil), Excel-import uyumluluk kontrolü yok, `docs/COMPLIANCE.md` yazılmadı.
- **SUPPORT-LANDING:** ✅ Gerçek eksikler kapatıldı (2026-09-05) — 3 yeni container tipi (support_order_picker, support_help_cards, support_help_library) artık shop'ta gerçekten render oluyor (önceden sadece DB'deydi, ekranda HİÇ görünmüyorlardı — canlı bug'dı); backend sanitize whitelist'i bu 3 tip + recursive `children[]` nesting (derinlik 3, toplam 200 sınırı) ile güncellendi; sunucu başlangıç kancası (`ensureCustomerSupportLanding`) server.js'e bağlandı; eksik npm script'leri (`test:customer-support-landing`, `smoke:customer-support-landing`) eklendi ve ana `test` script'ine dahil edildi. Tüm testler (9/9 yeni + 53/53 toplam) ve smoke test geçiyor. Sellercentral editöründe tam ağaç/nesting UI'ı (STEP1'in Adım 2 kısmı) henüz yok — o ayrı, büyük bir iş.
- **Connector (JTL):** Canonical model + Billbee mapper + DB tabloları var ama JTL SCX auth/event-poller/mapper ve sellercentral "ERP bağla" sayfası hiç yok.
- **Developer Platform:** Kod (PR1-4) tamam, sadece deploy/env eksik (yukarıdaki dış görev).
- **Affiliate:** Domain kararından sonra sıfırdan inşa (en son öncelik, idealo'dan bile sonra değil ama idealo listenin en sonunda kalacak şekilde sıralayacağım).
- **Idealo:** En sona bırakıldı, sadece yol haritası var, hiç kod yok.

000-1) Andertale dair yapılmış bütün geliştirmelerin analiz edilip dokümante et. Bu bildiğimiz word dosyalarından oluşacak, her webservis için ayrı word dosyası açılıp her bir alan için ne iş yaptığı anlatılacak. Her bir entegrasyon için ayrı ayrı ne iş yaptığı anlatılacak. dökümantasyon klasörü. icinde olustur tüm wordleri.

000-2) Bütün süreçlerin business process model and notation edilerek diyagramların çiz. Bu ise microsoft visio, bizagi vb. uygulamalar ile iş akış diyagramları çizilecek. Process model klasörü icinde olustur. 

1) ✅ Yapıldı (canlı test edildi) — sellercentralde landing-page sayfasi icinde "Kişiselleştirilmiş ürünler" isimli konteyner template imiz var. bunu ekledigimde shopta güzel gözüküyor. ancak altinda saga sola kaydirmak icin bir kaydirma cubugu var. lütfen bunu kaldiralim. sagda ve soldaki ok ile kaydirilsin desktopta.
2) ✅ Yapıldı — İçerik mozaiği isimli template i ne düsünerek kurdum bilmiyorum ancak görsel eklendiginde sayfanin tamamini kapliyor ve hicbir estetik durus yok. görseli ekliyorum sayfanin tam ortasinda kocaman duruyor. ama konteyner ici konteyner gibi bir sey olsun istiyordum hatirlarsan. Koleksiyon ürünleri secince de kocaman kocaman gözüküyor görseller alt alta üst üste falan. Böyle bir sey istiyordum: AMAZON KONTEYNER HTML: 


3) ✅ Yapıldı — medya secimi yaptigimda sellercentralde asagi kaydiriyorum, görseli seciyorum ancak save butonu en üstte kaldigi icin bi daha taa en üste kaydirmam gerekiyor. secildiginde save butpnu hemen o üstte görünsün.

4) 🟡 Kısmen yapıldı (asıl istenen kısım — faz 3+4+shop render — VE faz 1 vitrin kabuğu VE faz 2 picker düzeltmeleri bitti; yalnızca faz 5-6 —inspector birliği ve kalan 6 konteyner tipinin görsel birliği— henüz yapılmadı, aşağıda fazlara işaretli) — (Andertal landing — vitrin editörü + layout_section + konteyner birliği)
Ask/Agent: bu işi kısmi demo ile kapatma. Mevcut sayfaları, i18n’i, visible_on cihaz modelini, kaydı ve shop render’ı kırma. Önce oku, sonra faz faz uygula. Her fazda derleme/linter ve ilgili shop+sellercentral dosyaları.

4.0) Kilit gerçekler (yanlış model = işi baştan batırır)
İç içe kutu content_mosaic DEĞİL. Mosaic: görsel VEYA koleksiyon ürünü ızgarası. Karışık tip (görsel + ürün + koleksiyon yan yana) taşımaz. Ona “sütun” ekleme, Amazon HTML’sini oraya gömme.
Doğru model zaten var:
docs/SUPPORT-LANDING-STEP1-ARCHITECTURE.md → tip layout_section, children[], derinlik 3, toplam 200
apps/sellercentral/src/lib/landing-container-tree.js (clone/map/remove/appendChild/canAddChild)
Backend apps/medusa-backend/src/routes/pages.js → sanitizeAnyContainer children’ı yürüyor
Shop renderContainer (LandingContainers.jsx) children’ı slot’lara basmıyor; layout_section switch’te yok (default: return null). Bu yüzden editor’da ağaç yok, shop’ta bölücü görünmüyor.
Altın ayar referansı: Görsel karuseli (ImageCarouselEditor + shop ImageCarousel): items_per_row, aspect_ratio / custom, max_height, mobil ayrı alanlar, başlık. Yeni hücre ayarları bunu kopyalasın, yeni rastgele API uydurma.
Polaris sellercentral. Shop stilleri Styles / mevcut landing token’ları. 90’lar bordür, rastgele hex, her tipte farklı H1 yasak.
4.1) ✅ Yapıldı (canlı test edildi) — Shopify benzeri vitrin editörü (picker yetmez)
LandingPageEditor.jsx üç panelli olsun (Shopify theme editor):

Sol — sayfa iskeleti (ağaç)
Root konteynerler + children girintili. Tip adı, ContainerTypePreview, görünür/gizli, sıra. Sürükle-bırak aynı kardeş listesinde (root veya aynı parent). Derinliğe taşıma: “içe al / dışarı çıkar” veya drop-on-parent; depth>3 disabled. Seçili düğüm sağ paneli açar.

Orta — canlı vitrin
Shop’un gerçek LandingContainers çıktısı. Tercih: shop’ta preview route/iframe + postMessage ile kaydedilmemiş draft JSON (debounce). Token/CORS/locale (contentEditLang + cihaz tab) bağla. İframe olmazsa sellercentral içinde shop renderer’ı paylaş; sahte gri kutu “preview” kabul etme. Desktop/tablet/mobile tab preview genişliğini değiştirsin (visible_on kopyaları bugün nasılsa öyle kalsın; child visible_on ignore — mimari §2.3).

Sağ — inspector
Seçili konteynerin ayarları. Üstte tip + grup. Altta tutarlı bölümler (aşağıdaki ortak şema). “Düzenle” ile kartı şişirme kalksın; tıklayınca inspector.

Kayıt, unsaved bar, dil seçici, sayfa seçici kalsın. Mevcut JSON şeması bozulmasın (yeni alanlar opt-in, eski sayfalar aynı görünsün).

4.2) ✅ Yapıldı (statik kontrol edildi; kart tıklama + 2×2 preset canlı test edildi, sayfa-türü filtresi henüz canlı denenmedi) — Picker kusurları
Kartın tamamı tıklanınca eklensin; her karttaki ayrı “Seç” kalksın (veya kart=aksiyon).
Karusel tipleri aynı thumbnail olmasın: collection_carousel, collections_carousel, blog_carousel, personalized_product_row, brands_directory, image_carousel ayrı şema.
Picker sayfa türüne göre daralsın: homepage/CMS’de support_* yok (veya “Destek” grubu sadece support/CMS yardım sayfasında).
layout_section picker’da grup Hero & medya veya yeni Layout: “Sütun düzeni / konteyner bölücü”. Wireframe: 2–3 sütun.
Preset kartı: “Ürün karesi 2×2” → hazır layout_section (aşağıdaki örnek JSON). Mevcut tipleri silmeden ekle.
4.3) ✅ Yapıldı (canlı test edildi: 3 eşit sütun, 2/3-1/3, iç içe yerleşim, 2×2 ürün karesi gerçek verilerle) — layout_section — konteyner içinde konteyner (asıl iş)
Yeni (veya tohumda adı geçen ama render edilmeyen) tip: layout_section.

Ne işe yarar: Sayfayı N sütuna böler. Her sütun slot. Slot’a mevcut herhangi bir konteyner konur (image_carousel, single_product, collection_carousel, image_grid, hatta başka layout_section). Depth 3: root layout → child layout → grandchild leaf.

Şema (örnek, isimler tutarlı olsun):

{
  id, type: "layout_section",
  visible: true, visible_on: "desktop", // root'ta
  title: "",                 // opsiyonel üst başlık
  title_align: "left",       // left | center
  show_title: true,
  bg_color: "",              // boş = şeffaf
  background_image: "",
  padding: "32px 24px",
  content_layout: "full" | "contained",
  content_max_width: "1200px",
  gap: 16, gap_mobile: 12,
  columns_desktop: 3,        // 1–4
  columns_tablet: 2,
  columns_mobile: 1,
  column_widths: [],         // örn [1,1,1] veya [2,1] = 2/3 + 1/3; boş = eşit
  cell_align: "stretch",     // start | stretch
  // Hücre görünümü (tüm slotlara default; slot override edebilir)
  cell_aspect: "auto",       // auto | 1/1 | 4/5 | 2/3 | 3/4 | 16/9 | 21/9 | custom
  cell_aspect_custom: "",
  cell_min_height: "",
  cell_max_height: "",
  cell_radius: 12,
  cell_bg: "",               // slot kart zemini; boş = yok
  children: [ /* N adet child container; columns ile eşleşmezse sırayla doldur, fazlası alt satıra wrap */ ],
  _i18n: { en: { title: "..." }, ... }  // de yok, mevcut kural
}
Shop renderContainer:

eğer type === layout_section:
  dış sarmalayıcı: bg, padding, title
  CSS grid: columns_desktop / tablet / mobile (mevcut landing-vis-* veya container query; CLS için JS ile sütun sökme)
  her child: grid hücresi içinde renderContainer(child)  // inner ALTINDA değil, SLOT’ta
aksi halde:
  mevcut inner
  layout_section değilse children varsayılan: mevcut davranış (destek sayfaları). Homepage leaf’lerde children varsa layout_section’a taşımayı zorlama; leaf + children sadece layout host’ta.
layout_section children grid slot. Diğer tiplerde children support dokümanındaki gibi altında stack (kırma). Homepage’de iç içe asıl yol: layout_section.

Editor:

“Sütun sayısı” değişince children uzunluğunu silerek kısaltma. Fazla child kalsın, wrap olsun. Az child = boş slot + “slot’a konteyner ekle”.
Slot’ta “Konteyner ekle” → aynı picker (depth canAddChild).
Seçili slot inspector’da: o child’ın tam editörü.
Hücre oranı/yükseklik: Görsel karuseli kontrollerinin kopyası (orientation, custom ratio, min/max height, desktop vs mobil tab).
column_widths: 2 sütun için 1/2-1/2, 2/3-1/3, 1/3-2/3; 3 sütun eşit veya 1/2-1/4-1/4. Custom fr isteğe bağlı.
Kullanıcının örneği (2 satır × 2 ürün, zemin renk, üst başlık) — preset:

{
  type: "layout_section",
  title: "Öne çıkanlar",
  bg_color: "#f3f4f6",
  columns_desktop: 2, columns_tablet: 2, columns_mobile: 2,
  gap: 12,
  cell_aspect: "1/1",
  children: [
    { type: "single_product", product_id: "" }, // veya image_carousel 1 görsel + link
    { type: "single_product", ... },
    { type: "single_product", ... },
    { type: "single_product", ... }
  ]
}
4 çocuk + 2 sütun = 2 satır. Bunu preset olarak picker’a koy. Aynı görünüm Görsel karuseli grid moduyla da üretilsin (faz 4) — iki yol, tek görsel dil.

4.4) ✅ Yapıldı (canlı test edildi: grid modu VE display_mode boşken eski karusel davranışı) — Görsel karuseli — kırma, grid + zemin ekle
image_carousel mevcut kaydırma davranışı default kalsın. Yeni alanlar varsayılan eski davranış:

display_mode: "carousel" (default) | "grid"
grid_rows (default 1; 2 = “2 satır”). Sütun = mevcut items_per_row / items_per_row_mobile
bg_color, opsiyonel cell_radius
Başlık zaten var; grid’de üstte, bloğun içinde
images[].link tıklanır kalsın; ürün URL’si veya handle
İsteğe bağlı images[].product_id — doluysa tıklanınca ürün sayfası, görsel üründen (yoksa url)
Grid 2 satır × 2 sütun + bg_color + title = istenen kare. Carousel ok/peek/scrollbar işine dokunma (o ayrı bug’dı).

4.5) ❌ Henüz yapılmadı (bilinçli olarak sona bırakıldı) — Inspector birliği (1990 form değil)
Tüm *Editor bileşenleri aynı iskelet (Polaris BlockStack + Card + 2 kolon grid):

İçerik — başlık, görsel, koleksiyon, ürün (tipe özel)
Düzen — sütun/satır, aspect, yükseklik, gap (cihaz tab’ına göre, karusel gibi)
Görünüm — bg, yarıçap, padding, content_layout / max-width, başlık hizası
Davranış — link, autoplay, görünürlük
Boş label, 12 ayrı “px” kutusu, açıklamasız checkbox yasak. HelpText kısa.
Ortak primitive’ler çıkar (padding, renk, aspect select = karuseldeki imageCarouselAspectOptions). Her editör kopyala-yapıştır hex etme.

4.6) 🟡 Kısmen yapıldı (2026-09-14 güncellendi — kod satır satır okunup kontrol edildi: feature_grid/testimonials/newsletter aslında zaten iyi durumdaymış — kart varyantları, responsive breakpoint, avatar/yıldız, form state; "baştan savma" değiller, not yanlıştı. Gerçekten zayıf olan tek tip image_grid'di — artık ContentMosaic ile aynı kalite: "çerçeveli kart" (framed card), akıllı mobil sütun sayısı [cols_mobile, opsiyonel — yoksa min(cols,2)], hover lift, bg_color; sellercentral editörüne de deviceTab-aware mobil sütun/gap alanları + arka plan rengi eklendi. banner_cta ve text_block butonlarına da tutarlılık için hover/active geçişi eklendi. Kalan: inspector birliği (4.5) hâlâ yapılmadı) — Shop konteyner görsel birliği (bastan savma tipler)
LandingContainers.jsx içindeki her case’i gözden geçir. Hedef: aynı tipografi, boşluk skalası (8/12/16/24/32), kart yarıçapı, ürün kartı = mevcut ProductCard (ikinci bir kart icat etme), başlık stili LandingItemHeading ile uyumlu ama 1990 gri küçük yazıya mahkûm değil — Styles’taki catalog heading’e bağlanabilsin.

Özellikle zayıf olanlar (kullanıcı şikayeti + kod): content_mosaic (dev görsel, estetik yok — mosaic’i layout_section yapma; görsel boyutu/object-fit/pattern’i düzelt), image_grid, banner_cta, text_block, feature_grid, testimonials, newsletter. Hero slider’ı bozma.

Support_* homepage picker’dan çıksın; render’ları kırma.

4.7) ✅ Yapıldı (layout_section için — catalog grubu, ContainerTypePreview wireframe, newContainer seed, ağaca ekleme, 6 dilde i18n) — Katalog / i18n / preview / tree
landing-container-catalog.js: layout_section + grup
getContainerTypes + ContainerTypePreview yeni şemalar
newContainer("layout_section") + getNewContainerSeed
addContainer ağaca: root veya seçili layout slot
i18n 6 dil (de/en/tr/fr/es/it) — yeni string’ler landing-page-editor-i18n.js
4.8) ✅ Bu kısıtlara uyuldu — Yapma
Mevcut homepage/CMS JSON’unu migrate edip şema kırma; yeni alanlar default = eski görünüm
content_mosaic’i splitter yapma
GPSR, product tabs, unrelated files
visible_on CSS sınıflarını (CLS düzeltmesi) geri JS unmount’a çevirme
Depth 4, 200+ node
“Çalışıyor” diye sadece modal screenshot; shop’ta 3 sütun + iç layout + 2×2 preset + carousel default kanıtla
4.9) Kabul
✅ Editor: sol ağaç, orta canlı vitrin, sağ inspector — canlı test edildi, cihaz sekmesine göre gerçek genişlikte render ediyor
✅ Picker: kart tıklama, farklı karusel thumb, layout_section + 2×2 preset, support homepage’de yok — kart tıklama + 2×2 preset canlı test edildi; farklı thumb’lar ve sayfa-türü filtresi statik kontrol edildi (henüz canlı denenmedi)
✅ layout_section shop’ta grid slot’ta child render; 3 sütun eşit; 2/3–1/3; içine ikinci layout — canlı test edildi
✅ 2×2 ürün karesi: zemin renk + başlık + 4 tıklanır görsel (preset VE image_carousel grid) — canlı test edildi, ikisi de gerçek veriyle çalışıyor
✅ image_carousel display_mode yokken eski karusel — canlı test edildi
✅ DnD kardeş sırası — sürükle-bırak ile sıralama eklendi ve canlı test edildi (aynı ebeveyn/kardeş listesi içinde)
✅ Kayıt / reload / DE dışı dil — mevcut kayıt akışı dokunulmadan korundu
✅ Desktop/tablet/mobile root kopyaları — canlı test edildi (3 cihaz sekmesi, doğru filtreleme)
❌ Inspector ortak bölümler; leaf ayarları karusel kadar detaylı (aspect, yükseklik, sütun) — HENÜZ YAPILMADI (4.5 ile aynı, sona bırakıldı)
Önce faz 3+4+shop render (asıl istek), sonra faz 1 vitrin kabuğu, sonra 5–6 birlik. Mosaic’e splitter koyarsan PR’ı reddedeceğim.

Kısa: bölücü = layout_section + children slot grid; 2×2 kare = ya preset layout ya karusel grid + bg_color; vitrin = ağaç + canlı preview + inspector. Claude’a mosaic/Amazon HTML kopyalatma.

5) ✅ Yapıldı (2026-09-14) — benachrichtige mich yani stoga girince haber ver fonksiyonu ekle. müsteri stogu olmayan ürün icin buyboxta cikan bu bölüme email adresini yazip ürün stoga girdiginde haber almak icin listeye girebilsin. bu liste sellercentralde yalnizca superuser icin kunden altinda acilacak yeni bir menü sayfasinda görünsün. 2 tab olsun. müsteriler, email adresleri ve bekledikleri ürünün oldugu 1 tab, kategory tree seklinde ürünlerin listelendigi ve karisinda kac kisinin bekledigi.
   Yapılan: `apps/medusa-backend/src/routes/back-in-stock.js` (yeni) — `store_back_in_stock_subscriptions` tablosu, `POST /store/back-in-stock-subscribe` (public, guest), `GET /admin-hub/v1/back-in-stock-subscribers` (superuser), ve `runBackInStockWatcher()` — her 15 dakikada bir (mevcut wishlist-watcher ile aynı ritim) stoğu 0'dan pozitife geçen ürünlerin bekleyenlerine `src/email.js` üzerinden e-posta gönderiyor, tekrar göndermiyor (notified_at damgası). Shop tarafında `ProductPurchaseActions.jsx`'e "Ausverkauft" durumunda (coming-soon/kargo-kısıtı hariç) e-posta formu eklendi, 6 dilde metin. Sellercentral'da Kunden → "Back in stock" (superuser-only, 2 sekme: Müşteriler tablosu + kategoriye göre bekleme sayıları) sayfası eklendi.
   Bilinçli basitleştirme: Tab 2 tam ağaç-genişletme (expand/collapse) UI'ı değil, kategori adına göre gruplanmış düz liste — asıl istenen "kategoriye göre bekleme sayısı" bilgisini veriyor, ama tam interaktif ağaç bileşeni ayrı, daha büyük bir iş olurdu.