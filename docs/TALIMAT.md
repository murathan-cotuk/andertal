27.03.

-----------------------------------
11. MEDIA MANAGEMENT (SELLERCENTRAL)
-----------------------------------

- GOOGLE DRIVE BAGLANTISI

Önce yapman gerekenler (5-10 dk):                                                                                                                                                       
  1. Google Cloud Console:                                                                   
  - https://console.cloud.google.com → Yeni proje oluştur
  - "APIs & Services" → "Enable APIs" → Google Drive API aktifleştir
  - "Credentials" → "Create Credentials" → OAuth 2.0 Client ID
    - Application type: Web application
    - Authorized redirect URI: https://YOUR_BACKEND_URL/admin-hub/v1/drive/callback
  - Client ID ve Client Secret'i kopyala

  2. Backend env var'ları ekle:
  GOOGLE_DRIVE_CLIENT_ID=your_client_id
  GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
  SELLERCENTRAL_URL=https://your-sellercentral-url.com

  3. Backend'e googleapis ekle:
  cd apps/medusa-backend && npm install googleapis

  ---
  Bu kurulumu yaptıktan sonra "hazır" de, backend + frontend kodunu implement edeyim:        
  - Drive OAuth2 bağlantısı (connect/disconnect)
  - Klasör seçme (Drive URL yapıştır)
  - Gerçek zamanlı push notification sync (yeni dosya → anında MediaPage'e eklenir)
  - Polling fallback (her 10 dakikada bir)
  - MediaPage'de "Google Drive" kartı

  Kurulumu yapıp hazır olduğunda devam edelim.


---------------------
- ???shopta top barda Kostenloser Versand ab 50 € diyor. buradaki "50" degeri her ülke icin girilen deger olmali. sabit bir sey yazmamali. backende her ülke icin bu deger yazili olmali. shopta secili ülkenin backenddeki karsiligini bulup onu yaz buraya
- ???shopta versandkosten dile göre belirleniyor. ülkeye göre belirlenmeli. ülke olarak ispanya seciyorum. dil ispanyayken 12,49 kargo ücreti gösteriyor. dili almancaya cekince 5,99 diyor tekrar. ancak ülke hala ispanya. checkoutta adrese de ispanya yaziyorum ancak 5,99 kalmaya devam ediyor. teslimat adresi her zaman ilk önce baz alinmali.
- sepete bi ürün ekliyorum. sellercentralde bu ürünün almanca adina a demisim, iniglizce adina b demisim. shopta almanya secip sepete ekliyorum. dil ya da ülke secince sepetteki ismi a olarak kaliyor. ancak ingilizceye gecinde sepette ve checkoutta degistirsem bili ismi de o dile göre güncellenmeli.
- ???shopta ülke secicide ve adres kismindaki ürün secici kisminda göterilecek ülkeler sadece
  sellercentarlde settings/shipping icinde kargo fiyati belirlenmis ülkeler olsun. yani      
  eger sellercentralde settings/shopping icinde bir versandgruppe icinde bir ülkeye fiyat  
  belirlenmis ise o gözüksün. belirlenmemis ise gözükmesin. o yüzden ülke sinirlamasi          olmasin cünkü sellercentraldeki settings/shipping sayfasindaki ülke secicide dünyadaki       tüm ülkeler var. tüm ülkeler icin fiyat belirttiysem shoptaki ülke secicide dünyadaki tüm    ülkeler gözükmeli. anladin?
- ???Versandkosten dogru calismiyor. adim adim anlatayim. sellercentralde settings/shipping kisminda versandkostenfrei kisminda ülkelere göre tutar belirliyorum. almanya icin x, birlesik krallik icin y belirledim. shopta almanya icin sepet tutari x in üstünde ise ya da birlesik krallik icin y nin üzerindeyse "kostenlos" yazacak. ancak burada belirlenen tutarlarin altindaysa su sekilde olacak: sellercentralde settings/shipping kisminda versandgruppen olusturuluyor. standart DHL olusturdum ve almanya, birlesik krallik, hollanda icin kargo fiyati belirledim. mesela almanya icin a yaptim fiyati. sellercentarlde ürünler sayfasinda gidip olusturmus oldugum versandgruppeni test-test skulu ürünün icine girip versand kismindaki dropdownda seciyorum. sonra shopa gidip almanya ülkesini seciyorum ve test-test skulu ürünü sepete ekliyorum. ürün fiyati 28,9€ yani belirledigim x fiyatindan da y fiyatindan da düsük. sidebar warenkorb, /cart sayfasi ve /checkout sayfasinda Versand kisminin karsisinda görmek istedigim sey "a" cünkü versandgruppe icinde almanya icin bu sekilde belirleyip bunu ürün ile eslemistim. ancak su anda wird an der kasse berechnen diyor ve kasse ye gidince de kostenlos diyor. komple yanlis. 

- ???shopta shipping icin calculated at checkout diyor. neden? her yerde hesaplansin. sidebar cartta, /cart sayfasinda, checkoutta her yerde hesaplansin. 50€ dan sonra ücretsiz kargo sunuyoruz bu arada. bunu da sisteme su sekilde isleyelim: sellercentralde settings/shop icinde Versand Kostenfrei ab: diye bir kisim olsun. oraya yazilan tutar shoptaki ücretsiz kargo sinirini belirlesin. her güncellemede oradaki deger baz alinsin.
- shopta siparislerim sayfasinda siparislerin yaninda faturayi görmek istiyorum. kargoya verildiginde kargo takip numarasi da siparisin orada yer alsin. fatura olusturma modülü falan var stripe ta nasil yapilacaksa yap. yapmam gerekeni söyle. fatura icin nasil template hazirlayalim vs.
- sellercentralde siprisi versenden yapabilelim. versenden yaptigimizda kargo etiketi basilsin ve lieferschein basilsin. bunlari print edebilelim. kargo etiketi basildiktan sonra kargo takip numarasi hem sellercentralde ilgili orderda yazsin hem de shopta müsteriye fatura ve takip numarasi gitsin. toplu siparis versenden yapildiginda verandzentrum gibi bir sayfa acilsin ve orada sirayla siparisler ciksin. atiyorum ilk siparisin icinde 3 farkli ürün var. o 3 farkli ürünün barkodu scanlendiginde ya da manuel olarak eklendi, siradaki ürün tarzi bir butona basmak sureti ile siparisler islensin. billbee ve xentral tarzi.
- shopta müsteri siparisi iade et butonuna basabilsin. siparisin teslim edilme tarihi siparisin icinde olsun. teslimattan sonra 14 gün icinde retoure edebilir. 14 günü gecti ise maalesef iade edemezsin gibisinden bi uyari ciksin. 14 gün icindeyse de iade talebi bana gelsin sellercentralde retoure sayfasina düssün, talep incelendikten sonra onaylanirsa kargo etiketi basalim ve retourenschein ya da iade faturasi ya da yasal olarak gereklilik ne ise onlar basilsin. iade numarasi da basilsin ve gözüksün orderin icinde. bunlar tabii shopta müsterinin kontosunda görüntüleyebilecegi seyler olsun. 
- siparis tutarini iade etme butonu da olsun sellercentralde retoure de. paket bana ulastiktan sonra iade secenegini secelim. tam ya da kismi iade icin gerekli tutari girelim. iade et dedigimizde ödeme yapilan kaynaga tutar aninda iade olsun.
- kargo etiketi olusturmak icin vs tabii ki bir kargo saglayicisi entegre etmek gerekecek. https://belucha-sellercentral.vercel.app/tr/settings/shipping sayfasindan kargo saglayicisi eklenebilsin. DHL, DPD, GLS, UPS, FedEx, USPS, Go Exppress ya da saticinin istedigi özel bir kargo saglayicisi eklenebilsin. buraya ilgili apiler eklendikten sonra etiket basma, takip numarasi girme, kargoyu takip edip status güncelleme ve bildirme adimlari uygulanabilecek tabii ki.
- settings icine apps/integrations diye bir sekme acalim. orada istedigimiz tüm programlari, saaslari entegre edebilelim. mesela ben proje hazir oldugunda billbee entegrasyon sistemi hesabi baglamak istiyorum. birlikte billbee entegrasyon sistemi hesabi baglamayi test edebiliriz. xentral, jtl vs. bilimum yazilimla entegre olunabilsin. api anahtari ve api sifresi olusturulabilsin. ayrica ödeme yöntemi, versandart yada sayfanin herhangi bir yerinden yapilmis entegrasyonlar da burada LOGO - ISIM - AYARLAR, DETAY SAYFASI vs seklinde liste halinde gözükebilsin.