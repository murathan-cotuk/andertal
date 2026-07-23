# Görev Listesi

17.07

1) Test müsteri hesabimdan test siparis verdim. Siparis email flowu cok güzel calisiyor. Saticiya gelen emailde satin alinan ürün görseli gözükmüyor. Saticiya giden emailde görsel gözüküyor ancak müsteride gözükmüyor. bunu düzelt. — **Durum: ✅ Yapıldı.**

2) Siparis verildiginde status hemen in bearbeitung oluyor. hemen olmamali. ilk önce status offen olmali. siparisin icine girip ürünleri scanlemeye basladigimizda siparis durumu in bearbeitung olmali. Bunun icin de bi email template flow hazirla. yani su anki siparisiniz alindi flowu siparis ilk verildiginde yani durumu offenken gönderilecek flow template i. yeni olusturacagin template ise siparis durumu in bearbeitung olacagi zaman gönderilecek template. — **Durum: ✅ Yapıldı.**

3) müsteilere gönderilecek email templatelerde PDF-Anhänge (dieser E-Mail-Schritt) diye bir alan var. buradan bu email ile gönderilmesini istedigimiz dosyalar secilebiliyor. diger flow templatelerde bu kisim yok. her template de pdf anhang ekleme bölümü koy. yeni olusturacagina da mevcutlara da. — **Durum: ✅ Yapıldı.**

4) siparis verildikten sonra siparis aldindi diye bi onay sayfasi gözüksün. 4 saniye sonrasinda siparislerim sayfasina yönlendirsin. — **Durum: ✅ Yapıldı.**

5) Biliyorsun ki müsteriye bonus puan veriyoruz ve müsteri bu puanlari sonraki alisverislerinde bozabiliyor. su an 25 bonus puana 1 euro indirim kazaniyor. ancak bunu 50 bonus puanda 1 euro olacak sekilde ayarlayalim lütfen sellercentral ve shopun her yerinde. — **Durum: ✅ Yapıldı.**

6) eger müsteri bir entegrasyon sistemi yahut bir erp vb. bir sistem kullanarak siparislerini islediyse sistemde gözüken ve müsteriye gönerilen fatura müsterinin kendi sisteminde belirleyip andertale api yolu ile gönderdigi fatura olmali. bu sadece fatura icin gecerli degil. lieferschein, retourelabel vs dosyalar ve bilgiler de bu sekilde müsteri tarafindan gelmeli. müsteriler hangi dosyalari kullanmak istediklerini kendileri sececekler. dilerlerse elbette bizim dosya taslaklarimizi da kullanabilirler. saticilarin bu tercihi nasil yapabileceklerine dair en ufak fikrim yok. amazon nasil yapiyorsa onun gibi sisteme entegre et bu modeli. — **Durum: ✅ Yapıldı.** (Satıcı Sellercentral → Entegrasyonlar'dan her belge türü için kaynak seçiyor + API anahtarı üretiyor; kendi sistemi `POST /api/v1/orders/:id/documents` ile PDF gönderiyor; Andertal artık kendi PDF'i yerine bunu sunuyor. JTL/Billbee'ye özel canlı senkronizasyon kapsam dışı bırakıldı.)

7) register olurken email yazildiginda böyle kayitli bir hesa var desin direkt mail girme kutusu altinda. register a basmayi beklemesin. — **Durum: ✅ Yapıldı.**

8) yeni siparis geldi baska bir seller ürününden. ancak superuser a bildirim gelmedi. — **Durum: ✅ Yapıldı.**

9) sellercentralde siparisler icine giriyorum. gelen siparis icin versandetikett kaufen diyorum. "Aus technischen Gründen konnte die Aktion nicht abgeschlossen werden. Unser Team wurde informiert und kümmert sich darum." hatasi veriyor. entegrasyon sorunu mu var? ne ise bul hallet. — **Durum: ✅ Yapıldı.**

10) siparislerin yaninda versenden ve etikett kaufen diye ayri iki buton olmasin. etikett kaufen butonu, versendene basildiginda acilan pencerenin icinde olsun. versenden dedikten sonra direkt gönder diyebiliyoruz ancak ilk önce siparis edilen ürünler tek tek scanlenmeli. o sekilde bir sayfa acilsin. atiyorum 6 farkli ürün siparis edildi farkli adetlerde 2,5,1 gibi. önce bir ürün acilsin yaninda tutar yazsin. scanleyince ilerlesin sürec ya da pakete kondugunu manuel sekilde onaylayalim buton ile. versenden yapildiktan sonra — **Durum: ✅ Yapıldı.**

11) Checkoutta Adres otomatik doldurma yaptiginda tüm adres straße ye yaziliyor. her yere ayri ayri doldurmali otomatik. — **Durum: ✅ Yapıldı.**

12) Register sayfasında almanca seçiliyken register oldum ama email ingilizce geldi. Newsletter de registry emaili de. — **Durum: ✅ Yapıldı.**

13) Mobilde meine bestellungen sayfasına gidip siparişi aşağı açabiliyorum. Ancak orada ürüne tıkladığımda ürün sayfasına gitmiyor. Ayrıca sipariş içine giremiyorum. — **Durum: ✅ Yapıldı.**

14) sellercentralde orders sayfasinda icerikler ekrana sigmiyor. daha kompakt yap. sütun genislikleri tutup sürükleyip özellestirilebilsin excel gibi. sütünlar gizlenebilsin sag üstten columbns tarzi bir dropdown ile. — **Durum: ✅ Yapıldı.**

15) flowlardaki bestellung versendet flowunun tetikleyicisi ne bilmiyorum. ancak siparisin lieferstatusu versendet oldugu zaman bu flow tetiklenmeli. — **Durum: ✅ Yapıldı.**

16) Bestellung geliefert flowu siparis icindeki Sendungsverfolgung kismi altinadki kargo takip güncellemelerinde "Zugestellt" gözüktügünde tetiklensin. — **Durum: ✅ Yapıldı.**

17) customers/newsletter sayfasinda newsletter a abone olanlari göremiyorum. — **Durum: ✅ Yapıldı.**

18) customers/reviews sayfasinda sellerlara göre kategorize edelim. ancak en üstte superuser bilgileri olsun tabii. — **Durum: ✅ Yapıldı.**

19) sellers/errors sayfasindaki sorunlari tek tek incele ve cöz. — **Durum: ✅ Yapıldı.**

20) content/brands/authorizations sayfasi bos duruyor. ayrica brand sayfasi icinden yapabilelim bunu. autorization islemleri ile brandler ayni ekranda olmali. ekranin üstünde dogrulama islemi kayit islemi olsun altta da liste olsun. 1 sayfada 100 marka olsun. 1 satirda yan yana 4 tane 25 satir seklinde. brand autorizations kaldiriyorsun yani. brand icine kuruyorsun. — **Durum: ✅ Yapıldı.**

21) shopa girdim sepete ürün ekledim. satin almadan ciktim. abandoned checkouts sayfasina baktim. evet orada gözüküyor. ancak Kunde kisminda ve E-Mail kisminda hicbir sey yazmiyor. her abandoned checkouts satirinin en saginda durum belli olsun. bu sepetteki ürünler silindi mi, satin mi alindi, hala sepette duruyor mu o yazsin. hala sepette duruyorsa zaten flow calisacak. satin alindiysa satin alinanlar sekmesine gidecek. silindiyse sepetteki ürünler silinenler sekmesine gidecek. hala sepettekiler sepettekiler sekmesine gidicek. all sekmesinde hesi gözükecek. email ve müsteri adi cok önemli dedigim gibi. cünkü email gidecek. flow hazirlandi. — **Durum: ✅ Yapıldı.**

22) marketing/automations sayfasi menüde gözükmüyordu, superuser icin görünür yapildi. — **Durum: ✅ Yapıldı.**

23) marketing/automations sayfasinda ayri bir "flow olusturma" (automation rule) sistemi vardi — content/flows'tan bagimsiz, kendi toggle/config kartlariyla (store_automation_rules). Kullanici: bu sayfa flow OLUSTURMASIN, sadece content/flows'taki gercek flow verisini raporlasin. Ayrica: flows sayfasina "reorder reminder" template'i eklensin; favorilenen ürünün stogu 10'un altina düstügünde email gönderen flow eklensin; favorilenen ürünün fiyati düstügünde hemen email gönderen flow eklensin. — **Durum: ✅ Yapıldı.** (Yeni flow şablonları bir sonraki backend deploy'unda otomatik oluşturulacak, taslak durumda — superuser etkinleştirmeli.)

24) mobilde shopu actim ve ana sayfaya kisayol olusturdum. ancak hic profesyonel durmuyor. insanlar siteye girip kesin kacarlar siteden. senden bir seyler düzeltmeni isteyecegim ancak bunlar disinda da siteyi kontrol et. amatörce duran yerlerde sen de ufak degisiklikler yap. simdi bu sekilde actigim icin mobilde sanki bir mobile app mis gibi gözüküyor. bu sitenin mobile app versiyonunu düzeltiyormusuz gibi düsünebilirsin.
- search bar üstünde bi bosluk var ya mobilde hani. saat, sarj, sebeke durumu falan gözüküyor. orasi dümdüz yesil gözüküyor. bu rengi nereden ayarliyorsun bilmiyorum ancak burasi sabit olmamali. mobilde bu renk, header rengi o an ne ise o sekilde gözükmeli ve gradiente dahil olmali. yani eger sellercentralden gradient secilmis ise direkt olarak bu kismin en üstünden second nav a kadar ilerlemeli. eger gradient secilmemisse navbarin rengini almali sabit bir sekilde. bu cok kritik.
- ikinci olarak mobilde sayfada duruyorum. en üstteyim mesela. sonra yukari kaydiriyorum özellikle ve ekranin altindaki menü yukari hareket ediyor. mesela bu cok yanlis. bu menü asla ve kat'a hareket etmemli. orada sabit durmali. yalnizca sepet, menü gibi sidebarlar acildigi zaman onlarin altinda kalmali z ekseninde. bu zaten böyle. ancak o bar ASLA AMA ASLA hareket etmemeli.
- siparis verildikten sonra bi bekleme süresi oluyor. orada yine kamyon ilerleyen bekleme ekrani gözüksün. siparis ver dedikten sonra yükleme ekraninda o gözüküyor zaten. siparisi verdikten sonra da orders sayfasi acilana kadar o bekleme ekrani gözüksün. hem mobil hem desktopta bu tabii.
- product cardlarda vs favorilere ekleme kalp simgesi sag altta olsun. sag üstte duruyor su anda ancak sag üstte sale batch i de var. alt alta kötü oluyor. sale batch i cardlarin eeeen üst eeen sag kösesinde durmali. zaten bunun icin sellercentralde batch ayarlamak icin bi sayfa yaptik orada güncelleriz ama bu cok önemli.
- search bar yanindaki logo cok kücük duruyor mobilde. sellercentralde content/styles sayfasindan mobile logonun size ini büyütmeme ragmen büyümüyor ve orada kücücük duruyor. padding 0 olmasina ragmen search bar ile ekranin solu ile arasinda hala bosluklar var vs. hakkini vererek yapar misin lütfen cünkü bu ayarlar asla dogruyu yansitmiyor. beni kandiriyorsun. search bar ile globe iconu arasinda bu kadar bosluk olmasina gerek yok mesela.

**Durum: ✅ Yapıldı** (tüm alt maddeler — status bar rengi, alt menü sabitliği, kamyon animasyonu, kart rozet çakışması, logo/boşluk düzeltmeleri).

---

22.07 — Canlıya alma öncesi denetim (Claude). Kod incelemesiyle bulundu, henüz uygulanmadı, kullanıcı onayı bekleniyor.

25) **[Performans, ciddi] Veritabanı bağlantı havuzu (connection pool) yok.** Backend'de 193+ yerde her istek için ayrı `new pg.Client()` açılıp kapatılıyor (`pg.Pool` hiçbir yerde kullanılmıyor). Trafik arttıkça yavaşlama, zaman aşımı ve çökme riski var — daha önceki bir OOM crash'in muhtemel sebeplerinden biri buydu. Canlıya çıkmadan önce en azından sık kullanılan uç noktalarda paylaşılan bir `pg.Pool`'a geçilmeli. — **Durum: ✅ Yapıldı** (en yüksek trafikli okuma yolları: shop'un ürün listeleme/arama/detay sayfaları + Sellercentral ürün yönetimi artık paylaşılan havuzu kullanıyor, canlı DB'ye karşı test edildi. Kalan ~190 düşük-trafikli uç nokta bilinçli olarak kapsam dışı bırakıldı — riskli, tek seferde yapılacak kadar acil değil.)

26) **[Performans] Ürün görselleri optimize edilmiyor.** Shop uygulamasında `next/image` hiç kullanılmıyor (next.config.js'de gerekli `remotePatterns` ayarı zaten hazır ama kullanılmıyor), her yerde ham `<img>` etiketi var. Sonuç: gereksiz büyük görsel indirmeleri, lazy-loading yok, mobilde/3G'de yavaş sayfa açılışı, kötü LCP/CLS (Core Web Vitals) puanları — bu hem Google sıralamasını hem kullanıcı sabrını etkiler. — **Durum: ✅ Yapıldı** (en yüksek etkili bileşen `ProductCard.jsx` — arama/kategori/anasayfa/öneri listelerinde tekrar tekrar görünen ürün kartı — `next/image`'e çevrildi; bunun için önce `next.config.js`'deki `remotePatterns` genişletildi, aksi halde harici URL'li ürün görselleri kırılırdı. Diğer 18 dosyadaki `<img>` kullanımları — ürün detay sayfası, sepet, sipariş listesi gibi daha düşük tekrarlı yerler — kapsam dışı bırakıldı, ayrı bir takip maddesi olarak eklenebilir.)

27) **[Performans] Gereksiz büyük CSS yükü.** Font Awesome ikon kütüphanesinin TAMAMI (`all.min.css`, ~70-100KB) her sayfada render-engelleyici şekilde yükleniyor, ama kod tabanında sadece **1 dosyada** gerçekten kullanılıyor. Ya o dosyadaki ikonlar projenin geri kalanı gibi satır-içi SVG'ye çevrilip CDN linki tamamen kaldırılmalı, ya da en azından sadece ihtiyaç duyulan alt küme yüklenmeli. — **Durum: ✅ Yapıldı** (o "1 dosya" incelendiğinde aslında **hiçbir yerden kullanılmayan, ölü bir bileşen** (`Navbar.jsx`, 322 satır) olduğu ortaya çıktı — hiçbir sayfa onu import etmiyordu. Dosya tamamen silindi, `layout.jsx`'teki render-engelleyici Font Awesome CDN linki kaldırıldı, ilgisiz kalan CSP `style-src`/`style-src-elem`/`remotePatterns` izinleri de temizlendi.)

28) **[Pazarlama/ölçüm] Ziyaretçi/dönüşüm analitiği kurulu değil.** Google Analytics, Meta (Facebook) Pixel gibi hiçbir izleme aracı bulunamadı. Şu an: kaç kişi siteye giriyor, sepete kadar gelip vazgeçiyor, hangi ürün/kategori daha çok satıyor — hiçbiri ölçülemiyor. Canlıya çıkmadan önce en azından GA4 (ve reklam planlanıyorsa Meta Pixel) eklenmesi öneriliyor; aksi halde pazarlama kararları kör alınır. — **Durum: ✅ Yapıldı** (GA4 altyapısı eklendi — yeni `GoogleAnalytics.jsx` bileşeni, `NEXT_PUBLIC_GA_MEASUREMENT_ID` ortam değişkeni ayarlanana kadar hiçbir şey yüklemiyor/göndermiyor, yani şu an devre dışı, güvenli varsayılan. Etkinleştirmek için: Google Analytics 4'te bir "Data Stream" oluşturup oradaki `G-XXXXXXXXXX` ölçüm kimliğini bu ortam değişkenine yazmanız yeterli. CSP de buna göre güncellendi. Meta Pixel eklenmedi — reklam hesabı/pixel ID'si olmadan eklemenin bir anlamı yok, istenirse aynı desenle kolayca eklenir.)

**Olumlu bulgular (ek işlem gerektirmiyor):** Sentry hata izleme kurulu ✅. Cookie/çerez onay banner'ı var ✅. Ürün sayfalarında SEO için structured data (JSON-LD) var ✅. robots.txt + sitemap.xml var ✅. Hassas uç noktalarda (login/register/2FA/şifre değiştirme) rate limiting var ✅. Sadık müşteri mekanikleri (bonus puan, favoriler, değerlendirmeler, terkedilmiş sepet e-postaları, "win-back" akışı) zaten kurulu ✅.

**Genel değerlendirme:** Mobil deneyim Görev 24'teki düzeltmelerle artık ciddi anlamda daha profesyonel duruyor, ama yukarıdaki 4 madde (özellikle #25 ve #26) gerçek trafik altında performansı doğrudan etkiler — büyümeden önce ele alınmaları öneriliyor. #28 teknik bir risk değil ama ölçüm yapılmadan pazarlama bütçesi harcamak riskli.

29) **[Ürün gösterimi] Sellercentral → Shop ürün akışı incelemesi.** Onay/görünürlük filtrelemesini kod üzerinden doğruladım: onaylanmamış/reddedilmiş satıcıların ürünleri arama, kategori ve marka listelerinde tutarlı şekilde filtreleniyor — bu sağlam. İki bulgu: — **Durum: ✅ Yapıldı.**
- Bir ürün Sellercentral'da güncellendikten sonra shop'ta görünmesi **60 saniyeye kadar gecikebilir** (performans için kasıtlı önbellekleme — `Cache-Control: max-age=60`), ama Sellercentral'daki "Kaydet" sonrası satıcıya bu konuda hiçbir bilgi verilmiyor. Satıcı "kaydettim ama değişmedi" diye endişelenebilir. → `ProductEditPage.jsx`'teki kaydetme başarı mesajına 6 dilde "değişiklikler mağazada görünmesi bir dakikaya kadar sürebilir" notu eklendi.
- Çok yakın zamanda eklenen yeni "özel ürün rozeti" (custom badge) sistemi (`product-badges.js`, `CustomProductBadge.jsx`, `ProductImageBadges.jsx` — toplam 178 satır) gözden geçirildi: backend CRUD ve eşleştirme mantığı sağlam, ama **gerçek bir çakışma hatası** bulundu — aynı ürüne aynı köşeye (position) birden fazla rozet atanırsa hiçbir çakışma önleme mekanizması olmadığı için tam üst üste biniyorlardı. `CustomProductBadge.jsx`'e aynı köşedeki rozetleri otomatik alt alta dizen bir "stackIndex" mantığı eklendi.

30) **[Ciddi, "kusursuz" beklentisiyle çelişiyor] CSV/Excel toplu ürün içe aktarma fonksiyonunda gerçek hatalar bulundu.** — **Durum: ✅ Yapıldı.**
- **Düzeltme öncesi önemli bir keşif:** Aslında sistemde **iki ayrı** içe aktarma aracı var — Sellercentral navigasyonunda öne çıkan, gerçek `.xlsx` kabul eden, kategori/marka/gönderim grubu isimlerini doğru şekilde gerçek ID'lere çözümleyen, SKU'ya göre mevcut ürünü güncelleyen **olgun bir Excel sistemi** (`/import-export`, 2585 satır) — bu **sağlam**, ek düzeltme gerektirmedi. Aşağıdaki gerçek hatalar, arama menüsünden erişilen, daha az görünür **ikinci, basit bir CSV aracında** (`/products/bulk-upload`) bulundu:
  - El yapımı CSV ayrıştırıcı, tırnak içindeki satır sonlarını (örn. çok satırlı ürün açıklaması) **yanlış bölüyordu** — düzeltildi: tüm metni tek karakter akışı olarak ayrıştıran, tırnak-içi satır sonu ve kaçış tırnağını (`""`) doğru işleyen bir ayrıştırıcıyla değiştirildi, canlı örnek veriyle test edildi.
  - **Şablonda "kategori" ve "marka" sütunları vardı ama gerçekte hiçbir işe yaramıyordu** — girilen isimler kullanılmayan bir metadata alanına yazılıyordu. Düzeltildi: backend artık satırları işlemeden önce gerçek kategori/marka tablolarını bir kez sorgulayıp isim→ID eşlemesi çıkarıyor, canlı veritabanına karşı doğrulandı. Eşleşmeyen bir isim girilirse ürün yine oluşturuluyor ama sonuç tablosunda "kategori bulunamadı" gibi bir uyarı gösteriliyor (sessiz veri kaybı yerine).
  - **SKU/EAN tekilliği** konusunda ilk bulgum yanlıştı, düzelttim: tüm ürün oluşturma yolları (tekil ekleme, her iki toplu araç) aynı paylaşılan uç noktadan geçiyor, o da aynı EAN geldiğinde çoğaltma yerine mevcut ürüne yeni bir satıcı teklifi (buybox) olarak bağlıyor — bu zaten doğru/kasıtlı bir pazar yeri davranışı, düzeltme gerekmedi.
  - Bu ikinci sayfaya artık, gerçek Excel dosyası olan satıcıları daha iyi/olgun `/import-export` aracına yönlendiren bir bağlantı eklendi.
  - Sıralı/yavaş işleme (500 satıra kadar tek tek istek) düzeltilmedi — CSV aracı zaten ikincil/az kullanılan bir yol olduğu için önceliklendirilmedi.
