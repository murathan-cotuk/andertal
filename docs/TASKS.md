# Görev Listesi

17.07

1) Test müsteri hesabimdan test siparis verdim. Siparis email flowu cok güzel calisiyor. Saticiya gelen emailde satin alinan ürün görseli gözükmüyor. Saticiya giden emailde görsel gözüküyor ancak müsteride gözükmüyor. bunu düzelt.

**Durum: ✅ Düzeltildi (17.07.2026, Claude).** Kod tarafında hata yoktu — hem müşteri hem satıcı "Order Placed" akış şablonları aynı paylaşılan `{ORDER_ITEMS_HTML}`/`{PRODUCT_IMAGE}` mekanizmasını kullanıyor. Kök neden: müşteri şablonunun (`admin_hub_flow_steps`, flow_id `7fc08291-...`) ürün satırı bölümünde gerçek görsel yerine sabit bir gri kutu + 📦 emoji'si vardı (yazarın "alternatif: {ORDER_ITEMS_HTML} ekle" notu hiç uygulanmamıştı). Satıcı şablonu doğruydu, dokunulmadı. Düzeltme: müşteri şablonunun 6 dilinin tamamında (de/en/es/fr/it/tr) + yedek gövdede, emoji kutusu `<img src="{PRODUCT_IMAGE}">` ile değiştirildi (veritabanı içeriği, kod değişikliği değil — commit gerekmiyor, canlıda aktif).

2) Siparis verildiginde status hemen in bearbeitung oluyor. hemen olmamali. ilk önce status offen olmali. siparisin icine girip ürünleri scanlemeye basladigimizda siparis durumu in bearbeitung olmali. Bunun icin de bi email template flow hazirla. yani su anki siparisiniz alindi flowu siparis ilk verildiginde yani durumu offenken gönderilecek flow template i. yeni olusturacagin template ise siparis durumu in bearbeitung olacagi zaman gönderilecek template.

**Durum: ✅ Düzeltildi (17.07.2026, Claude — henüz commit/push edilmedi).**
- `store-checkout.js`: sipariş oluşturmada `order_status` artık `'in_bearbeitung'` değil **`'offen'`** ile başlıyor (Sellercentral UI zaten bu değeri destekliyordu, sadece hiç kullanılmıyordu).
- `orders.js` (`adminHubOrderPATCH`): `order_status` `'offen'`→`'in_bearbeitung'` geçişi tespit edildiğinde artık yeni bir akış tetikleyicisi (`order_processing`) ateşleniyor (mevcut `order_shipped`/`order_delivered` ile aynı desen).
- `VersandPage.jsx` (Sellercentral "Versand" tarama ekranı): bir siparişte **ilk ürün** taranınca/işaretlenince artık arka planda `order_status: 'in_bearbeitung'` PATCH isteği gönderiliyor — "taramaya başlama" anı tam olarak burası.
- Yeni e-posta akışı oluşturuldu (veritabanı, `admin_hub_flows`/`admin_hub_flow_steps`): "Order Processing", `trigger_key: order_processing`, `audience: customer`, mevcut "Sipariş Alındı" şablonunun (görsel düzeltmesi dahil) 6 dilde uyarlanmış bir kopyası — başlık ve giriş metni "siparişiniz paketleniyor" temalı, yasal "sipariş alındı" onay cümlesi "işleme başladık" cümlesiyle değiştirildi.
- Sellercentral Akışlar (Flows) sayfasına 6 dilde `order_processing` tetikleyici etiketi eklendi, seçenek listesinde görünür ve düzenlenebilir.
- ⚠️ Not: Kod değişiklikleri henüz commit/push edilmedi, canlıda aktif değil.

3) müsteilere gönderilecek email templatelerde PDF-Anhänge (dieser E-Mail-Schritt) diye bir alan var. buradan bu email ile gönderilmesini istedigimiz dosyalar secilebiliyor. diger flow templatelerde bu kisim yok. her template de pdf anhang ekleme bölümü koy. yeni olusturacagina da mevcutlara da.
4) siparis verildikten sonra siparis aldindi diye bi onay sayfasi gözüksün. 4 saniye sonrasinda siparislerim sayfasina yönlendirsin.
5) Biliyorsun ki müsteriye bonus puan veriyoruz ve müsteri bu puanlari sonraki alisverislerinde bozabiliyor. su an 25 bonus puana 1 euro indirim kazaniyor. ancak bunu 50 bonus puanda 1 euro olacak sekilde ayarlayalim lütfen sellercentral ve shopun her yerinde. 
6) eger müsteri bir entegrasyon sistemi yahut bir erp vb. bir sistem kullanarak siparislerini islediyse sistemde gözüken ve müsteriye gönerilen fatura müsterinin kendi sisteminde belirleyip andertale api yolu ile gönderdigi fatura olmali. bu sadece fatura icin gecerli degil. lieferschein, retourelabel vs dosyalar ve bilgiler de bu sekilde müsteri tarafindan gelmeli. müsteriler hangi dosyalari kullanmak istediklerini kendileri sececekler. dilerlerse elbette bizim dosya taslaklarimizi da kullanabilirler. saticilarin bu tercihi nasil yapabileceklerine dair en ufak fikrim yok. amazon nasil yapiyorsa onun gibi sisteme entegre et bu modeli.