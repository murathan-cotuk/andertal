02.07.

--- sellercentralde import-export sayfasindan ürün import etmek icin excel hazirladim. ürünler zaten var diyor ancak seller olarak products/inventory sayfasinda bu ekledigim ürünleri göremiyorum. superuser olarak products/inventory sayfasinda superuser eklemis gibi görüyorum. sanirim database e seller_id eklenmedigi icin bu sellerla bagdastiramadi. ayrica sistemde eklenmek istenen ean mevcut olsa bile o ean eklendiginde hata almamaliyiz. basarili olarak eklenmeli. ancak database de kayitli bilgiler disinda bir sekilde yüklemeye calisirsa sellerlar, superuser a bildirim gidecek ve ilgili üründe degistirilmek istenen kisimlara degisiklik önerisi gelecekti. bu fonksiyon calisiyordu ancak görünüse göre su an problem var gibi. database de kayitli bilgilerin aynisi seklinde ekleyecekse eger sellerlar hicbir uyari olmadan listelenmis olmasi gerekiyor. degisiklik olsa bile hata olmadan eklenmesi lazim seller in envanterine. superuser panelinde baktigimizda o ürün, ürün sahibi seller altinda listelenmeli. ancak ürün icinde, hangi sellerlar tarafindan listelenmis oldugu görünmeli. yani adim adim saydigim bu problemleri halletmeni istiyorum.


--- saticilarin olusturdugu kampanyalari kontrol edip bagladigimiz marketing hesabinda tek tik ile yayinlayalim. saticilar zaten bütcelerini belirlemis olacak. belirlenen bütceleri sectigimiz platformlarda dagitilmis sekilde kampanyalarini olusturalim. mesela müsteri günlük 5 euro bütce ile reklam olusturdu. shoptaki algoritmada o sekilde islemeye devam etsin. müsteriden alinan bu 5 euro müsteriden tahsile edilecek ve stripe imiza düsecek. bu 5 farkli secilen google ads, meta gibi yerlerde 1er euro seklinde paylasilacak. ya da kac platform secildiyse reklam vermek icin ona bölünecek gibi. anladin mi?

--- 1 ürünün birden fazla saticisi var ancak shopta diger saticilar gözükmüyor. sadece en son kim eklediyse o gözüküyor satici olarak. buyboxu neden otomatik en son ekleyene verdin?

--- excel ile ürün eklemede de unit_type ve unit_value degerlerinde hemen sonra per_unit degeri ekleyelim. bu sellercentral ürün sayfasindaki bahsettigimiz 1000 g kismina tekabül etsin.

--- excel ile yükledigim ürünü ilk yükleyen satici "satici A" idi. sonra "satici B" ile ürün bilgileri güncelledim, tekrar excel ekledim ancak superusera bir onay gelmedi ve ürün bilgileri degisti. yani ürünü sonradan ekleyen biri eanini da degistirebiliyor marka adini da. böyle olmamali. zaten sisteme girilen bir ürünün eani asla ama asla degistirilememli. ancak ürün bir kere sisteme eklendikten sonra ürün seuperusera aittir. sadece ilk ekleyen satici ürün üzerinde sorgusuz degisiklik hakkina sahiptir. baska saticilar bir sey degistirecekse sadece tavsiye verebilirler. baska saticilar ayni eana sahip ürünleri (child, parent yani hepsi) eklediginde sistemde onaylanmis bilgiler ile bir listeleme gerceklesmeli shopa. eger üründe degisiklik önerisi yaptiysa superuser a bildirim gelmedi, inventory sayfasinda ilgili ürünün saginda kirmizi bir bildirim isareti belirmeli ve "degisikliklik önerildi" tarzinda bi buton olmali. bastigimizda mevcut deger vs. önerilen degisiklik seklinde bir sayfa görmeliyiz. onaylarsak eger ürün önerilen seklinde görünmeli.


- billbee entegrasyonu (Billbee: Einstellungen → Kanäle → Shop hinzufügen → „Eigener Webshop (Billbee API)“. Shop-URL = Sellercentral’daki api_base_url (/api/billbee). Basic kullanıcı adı çoğu zaman Schlüssel (andertal_seller_…) VEYA e-posta; şifre = Sellercentral Basic-Auth-Passwort. Billbee.io API anahtarı .env’de gerekmez — Andertal backend çağrılan taraftır.)


--- bir siparis geldiginde ve sellercentralde trackingnummer girildiginde o trackingnummer in kargo güncellemelerinin görüntülenebilmesini ve gönderi durumuna göre siparis durumunun da güncellenmesini istiyorum. gönderildiginde "versendet", teslim edildiginde "zugestellet" olmali lieferstatus. bunun takibinin yapilabilecegi sekilde ayarla sellerin sisteme kaydettigi versandmethodeler ile


--- shopta ürünlerin icinde girdigimde breadcrumbs kisminda kategoriler gözüksün. kategorinin breadcrumbsu olsun ve kategorilere tiklanabilsin. Home
/
Koleksiyon
/
Vampire Vape 30ml Aroma - HeisenbergDE

Su an mesela bir ürünün breadcrumbsunda bu yaziyor ancak home yazmamali. "Koleksiyon" adinda da bir kategorimiz yok. o ürünün kategorisi ne ise o yazmali. icine eklendigi en son subkategri yer almali yani tiklanabilir bi sekilde


--- checkoutta kupon kodu girme kismi var. sellercentralde /coupons sayfasindan bir kupon ekledim, shopta bu kupou girdim ancak Ungültiger oder abgelaufener Coupon-Code diyor. iyi ayarlamamis. ayrica superuser icin kategorizasyonu düzgün yap. üstte kendi kuponlarim, altta satici kuponlari. bir sey yaparken her zaman superuser icin bu formati dikkate al.

--- sistemde mevcut olan bir eani baska bir satici ile ekledim. tüm bilgier otomatik geldi, sahane. ancak bu durumlarida status, draft olarak gelecek, yayin tarihi bos gelecek, sku bos gelecek, versandgruppe bos gelecek, related products bos gelecek (cünkü o ürün bizim seller accountumuzda degil), fiyat kismi bos gelecek, inventory kismi bos gelecek, hersteller kismi bos gelecek (buyboxu kim aldi ise shopta onun hersteller degeri gözükecek.), . Bu söylediklerim hem parent hem child artikeller icin gecerli olacak. ve save dedigimde kaydedilmiyor ürün. neden? ana ürün bilgilerinden yukarida saydiklarim haric hicbir sey degistirilmemis ise ürün 2. seller tarafindan kaydedilebilsin. cünkü o veriler sellerin kendine ait veriler, ürüne degil. seller yalnizca sisteme kayitli bir icerik degistirmek istediginde superusper a öneri olarak gelecek ve superuser bunu onayladikta sonra ancak live olacak. cünkü sisteme bir ürün eklendiginde artik sahibi superuser olacak. bir deger degistirmek isteyen baska saticilarin onay almasi gerekecek. ayrica shopta ilgili ürünün buybox u altinda "other sellers (3)" (ya da kac satici var ise) gösterilecek. tiklandiginda acilacak,  acildiginda yanlarinda fiyatlari ve aldigi yildizlar yazacak. ürüne yapilan yorumlar seller accounta da yasiyacak. buybox ise algoritma tarafindan en iyi saticiya verilecek. saticilarin fiyatlari, satis gecmisi, müsteri memnuniyeti gibi algoritmalar etkin olacak. 

-- ilgili kategorideki en cok satan ürüne ihtisamli bir "Bestseller" etiketi eklemissin. ancak bu bestseller etiketi benim sellercentralde ilgili yerde ekledigim görseldeki gibi görünmeli. category, collection, search, menu vs her yerde bestseller olan ürünün product cardinda bu bestseller etiketi gözükmeli


- qr kodu okuttugumda telefondan localhost:3002 aciliyor. yanlis. onun acilmamasi gerekiyor.      sellercentral andertal icin bir endpoint olustur. o endpointte docusign gibi imza atma bölümü   ekle. qr kodu okutunca o endpointe yönlendirilsin saticilar. ilk önce sellercentral giris  bilgileri istensin sellerlardan. sonra direkt beyaz ekran üzerinde sari dikdörtgen gözüksün.  oraya imzasini atsin satici. o imza dökümana eklenecek. imzasini atip gönder butonuna  bastiginda basarili, sellercentrale geri dönüp bu ekrani kapatabilirsiniz tarzi bi bildirim  gözüksün. hangi dilde dogrulanma yapildiysa o dilde gözüksün bu sayfa. ayrica verification  sayfasi da ya ingilizce ya almanca. ispanyolcasi, italyacasi ya da sistemde secilebilen diger   dillere göre ayarlanmamis. legal agreements de cok kisa gözüküyor. cok uzun olmali, her sey  hukuki olarak en ince detayina kadar yazmali. bi 10-12 sayfa olmali bu icerik. bunu da  düzenle          

-- content/landingpage sayfasinda ekleyebilmek icin bir container template olustur. ismi Bestseller carousel olsun. amazondaki mantik gibi. bir carousel olacak. bizde de var zaten kollektion karusel gibi bir template.bunun gibi yap. ancak bu konteyner da digerinden farkli olarak product card o kadar uzun olmayacak. bir seferde kac ürün gözükmesi gerektigini zaten sellercentral ayarlarda ayarlayabilicez. ayrica bu      Beststeller carouselde yine bir kategori sececegiz. ancak kollektion karusell templatimizden farkli olarak,     yalnizca secilen kategorideki BESTSELLER ürünler listelenecek burada. product cardlarin sol üstünde yine        bestseller etiketi gözükecek ve yanlarinda da o kategorideki bestseller siralamalari gözükecek. örnegin #5 gibi. carouselde mehr anzeigen dedigimizde kategori sayfasi template inde ürünlerin göründügü sayfa acilacak ve ürünler burada bestseller sirasina göre siralanacak. cok kritik ban anlasilmayan bir sey var ise muhakkak sor. net olalim bu konuda. her seyi tekte hallet.

--- bestseller carouselde kategori secme penceresi acildiginda tüm kategoriler alt alta gözükyor. parent kategori>subkategori seklinde ilerlemeliyi. bunun icin bir template imiz var. mesela buradaki liste olmasi gereken sekilde: products/new shop-zuordnung altindaki kategorie dropdownu

--- sellercentralde saticilarin kayit ettigi markalar shopta /brands sayfasinda gözüküyor normalde. son ekledigim marka gözükmüyor

--- shopta url neden /produkt/vampirevape... seklinde? andertal.com/de/de/ yazdiktan sonra hemen ürün bilgileri görünmeli. shopta bu sorun her yerde var. page olanlara /pages yaziliyor falan. ürün sayfasi acildiginda yalnizca o ürüne ait url gözüksün.

--- shopta müsteri olarak siparis verdigimde siparis onay sayfasi gözükmüyor. direkt /order sayfasina yönlendiriyor. bi sayfa cikiyordu önceden siparis alindi diyordu, yesil yuvarlak icinde tik isareti oluyordu, altinda siparisler sayfasina git tarzinda buton oluyordu. o sekilde olsun tekrardan

--- sellercentralde siparise kargo takip numarasi gelince lieferstatus otomatik versendet olmali. ancak olmuyor.

--- zahlungsstatus bezahlt oldugunda ve lieferstatus zugestellt oldugunda bestellt status abgeschlossen olmali. ancak lieferstatus versendet oldugunda da absgeschlossen oluyor. buna dikkat et.

--- siparis icine eklenen kargo takip numarasindan sonra direkt Paket wurde versendet durum güncellemesi geliyor. cok iyi. ancak diger durum güncellemeleri gelmiyor. mesela dhl, dpd, gls,ups ile farkli farkli siparisler denedim. hepsiyle paket gönderdim. ancak kargo durumu buraya yansimiyor. neden? ne yapabiliriz?
