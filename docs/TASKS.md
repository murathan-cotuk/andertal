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
- ✅ Commit `937a203`, push edildi (17.07.2026).

3) müsteilere gönderilecek email templatelerde PDF-Anhänge (dieser E-Mail-Schritt) diye bir alan var. buradan bu email ile gönderilmesini istedigimiz dosyalar secilebiliyor. diger flow templatelerde bu kisim yok. her template de pdf anhang ekleme bölümü koy. yeni olusturacagina da mevcutlara da.

**Durum: ✅ Düzeltildi (17.07.2026, Claude — henüz commit/push edilmedi).**
- Kök neden: PDF eki bölümü kodda `editAudience === "customer"` şartına bağlıydı — sadece müşteri odaklı akışlarda gösteriliyordu, satıcı odaklı akışlarda (`FlowsPage.jsx`) hiç görünmüyordu.
- Backend'i (`flow-automation.js`) kontrol ettim: PDF ekleme mantığının hedef kitleye (audience) bakan bir kısıtlaması yok, sadece geçerli bir sipariş ID'si arıyor — yani satıcı e-postalarına da teknik olarak zaten eklenebiliyordu, sadece arayüzde seçenek yoktu.
- Düzeltme: `FlowsPage.jsx`'teki `editAudience === "customer"` koşulu kaldırıldı — PDF eki bölümü artık **her akış türünde, her adımda** (yeni eklenen adımlar dahil, aynı arayüz bileşeni kullanıldığı için) görünüyor.
- ⚠️ Not: Kod değişikliği henüz commit/push edilmedi.

4) siparis verildikten sonra siparis aldindi diye bi onay sayfasi gözüksün. 4 saniye sonrasinda siparislerim sayfasina yönlendirsin.

**Durum: ✅ Düzeltildi (18.07.2026, Claude — henüz commit/push edilmedi).**
- Onay sayfası zaten mevcuttu (`order/[id]/page.jsx` içindeki `OrderConfirmationView`, checkout sonrası `?confirmed=1` ile açılıyor) ama otomatik yönlendirme yoktu — kullanıcı "Siparişlerim" butonuna manuel basmak zorundaydı.
- Eklenen: `OrderConfirmationView` içine `useEffect` ile 4 saniyelik `setTimeout(() => router.push("/orders"), 4000)` eklendi, component unmount olursa (kullanıcı manuel tıklarsa/sayfadan çıkarsa) `clearTimeout` ile temizleniyor.
- Manuel "Siparişlerim" ve "Alışverişe devam et" linkleri olduğu gibi kaldı, sadece otomatik yönlendirme eklendi.
- ⚠️ Not: Kod değişikliği henüz commit/push edilmedi.

5) Biliyorsun ki müsteriye bonus puan veriyoruz ve müsteri bu puanlari sonraki alisverislerinde bozabiliyor. su an 25 bonus puana 1 euro indirim kazaniyor. ancak bunu 50 bonus puanda 1 euro olacak sekilde ayarlayalim lütfen sellercentral ve shopun her yerinde. 

**Durum: ✅ Düzeltildi (18.07.2026, Claude — henüz commit/push edilmedi).**
- Tek gerçek kaynak (backend): `store-checkout.js`'teki `BONUS_POINTS_PER_EURO_DISCOUNT` sabiti `25` → `50` yapıldı. Bu sabit hem indirim hesaplamasında (`discountCentsFromBonusPoints`) hem de tersi yönde (maksimum kullanılabilir puan hesabı) kullanılıyor — tek yerden değişince backend'in tamamı otomatik güncellendi.
- Puan **kazanma** oranına (harcanan her 1 € = 1 puan) dokunmadım — talepte sadece **kullanma/indirim** oranı geçiyordu, kazanma oranı ayrı ve ilgisiz bir sabit (`bonusPointsEarnedFromOrderPaidCents`).
- Frontend'de bulduğum, aynı oranı tekrar hesaplayan/gösteren tüm yerler güncellendi:
  - `apps/shop/src/context/CartContext.jsx`: sepet indirim önizlemesi `/ 25` → `/ 50`.
  - `apps/shop/src/lib/medusa-client.js`: kod yorumu güncellendi.
  - `apps/shop/src/app/[locale]/bonus/page.jsx`: "25 Punkte = 1 € Rabatt" metni ve örneği (34→68 puan) güncellendi.
  - `apps/shop/messages/{de,en,es,fr,it,tr}.json`: `bonusHint` metninin 6 dilinin tamamında "25" → "50" ve örnek "34" → "68" (68/50=1,36 €, önceki örnekle aynı indirim tutarını koruyor).
- Sellercentral tarafında bu oranı gösteren/hesaplayan hiçbir kod bulunamadı (aratıldı) — sadece backend'in ortak sabitine bağlı olduğu için orada ek değişiklik gerekmedi.
- 6 dildeki JSON dosyalarının hepsi `JSON.parse` ile, değişen JS/JSX dosyaları `@babel/parser`/`node -c` ile doğrulandı — hepsi geçerli.
- ⚠️ Not: Kod değişiklikleri henüz commit/push edilmedi.

6) eger müsteri bir entegrasyon sistemi yahut bir erp vb. bir sistem kullanarak siparislerini islediyse sistemde gözüken ve müsteriye gönerilen fatura müsterinin kendi sisteminde belirleyip andertale api yolu ile gönderdigi fatura olmali. bu sadece fatura icin gecerli degil. lieferschein, retourelabel vs dosyalar ve bilgiler de bu sekilde müsteri tarafindan gelmeli. müsteriler hangi dosyalari kullanmak istediklerini kendileri sececekler. dilerlerse elbette bizim dosya taslaklarimizi da kullanabilirler. saticilarin bu tercihi nasil yapabileceklerine dair en ufak fikrim yok. amazon nasil yapiyorsa onun gibi sisteme entegre et bu modeli.