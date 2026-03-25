25.03.

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
siparis
- terkedilen sepet menüsü. ???
- shopta adres olusturmak istiyorum ancak address_line1 required uyarisi aliyorum. halbuki her yeri doldurdum. ???
- shopta warenkorba stok yazabiliyoruz artik. ancak o input kismi cok kötü. side warenkorbta ve warenkorb sayfasinda stok input yapma kismini prodct carddaki gibi yap. ???
- Shoptaki Bewertungen menüsü icinde verilen siparisler ve o siparislere verilen bewertunglar gözüksün. bewertung verilmemis siparisler de orada gözüksün ancak yildizla bos dursun ve jetzt bewerten desin. sonra shopta ürün sayfasinda ismin altindaki yildiz, bir siparis icin verilen tüm ortalama yorumlara göre dolsun, siparis sayfasinin en altinda yazilan yorumlar gözüksün, bewertunglar siparis bazli degil ürün bazli yapilsin. yani siparislerin icie girip bewerten dedigi zaman her ürün icin ayri ayri degerlendirme alani acilsin. ayrica sellercentralde de bu müsteri yorumlari bestellungen sayfasinda siparislerin saginda bir yerinde yildizlari gözüksün. yildiza bastiginda popup ciksin ve müsteri yorumunu görebilelim. ayrica liste seklinde müsteriler ana menüsünün altina submenü eklenip liste seklinde gözükebilir.
- sellercentralde ürünlerin icine kargo metodunu secebilecegimiz bir acilir menü olsun. settings/Shipping sayfasinda belirledigimiz fiyatlandirmalar ciksin bu acilir menüde. ona göre shoptaki ürün sayfasinda +bilmem kac euor versand tarzi bir sey gözüksün ve sepette de hesaba katilsin. settings/shopping sayfasinda kargo sirketi girip fiyat grubu yazalim. fiyat grubunu her ülke icin ayri ayri ayarlayabilelim. atiyorum DHL sectim grup adi yazma kismina "Standart Paket" yazdim. fiyat kismi icin alt alta tüm ülkeler cikacak. secip yanlarina fiyatlari yazabilecegim.
- shopta siparislerim sayfasinda siparislerin yaninda faturayi görmek istiyorum. kargoya verildiginde kargo takip numarasi da siparisin orada yer alsin. fatura olusturma modülü falan var stripe ta nasil yapilacaksa yap. yapmam gerekeni söyle. fatura icin nasil template hazirlayalim vs.
- sellercentralde siprisi versenden yapabilelim. versenden yaptigimizda kargo etiketi basilsin ve lieferschein basilsin. bunlari print edebilelim. kargo etiketi basildiktan sonra kargo takip numarasi hem sellercentralde ilgili orderda yazsin hem de shopta müsteriye fatura ve takip numarasi gitsin. toplu siparis versenden yapildiginda verandzentrum gibi bir sayfa acilsin ve orada sirayla siparisler ciksin. atiyorum ilk siparisin icinde 3 farkli ürün var. o 3 farkli ürünün barkodu scanlendiginde ya da manuel olarak eklendi, siradaki ürün tarzi bir butona basmak sureti ile siparisler islensin. billbee ve xentral tarzi.
- shopta müsteri siparisi iade et butonuna basabilsin. siparisin teslim edilme tarihi siparisin icinde olsun. teslimattan sonra 14 gün icinde retoure edebilir. 14 günü gecti ise maalesef iade edemezsin gibisinden bi uyari ciksin. 14 gün icindeyse de iade talebi bana gelsin sellercentralde retoure sayfasina düssün, talep incelendikten sonra onaylanirsa kargo etiketi basalim ve retourenschein ya da iade faturasi ya da yasal olarak gereklilik ne ise onlar basilsin. iade numarasi da basilsin ve gözüksün orderin icinde. bunlar tabii shopta müsterinin kontosunda görüntüleyebilecegi seyler olsun. 
- siparis tutarini iade etme butonu da olsun sellercentralde retoure de. paket bana ulastiktan sonra iade secenegini secelim. tam ya da kismi iade icin gerekli tutari girelim. iade et dedigimizde ödeme yapilan kaynaga tutar aninda iade olsun.
- kargo etiketi olusturmak icin vs tabii ki bir kargo saglayicisi entegre etmek gerekecek. https://belucha-sellercentral.vercel.app/tr/settings/shipping sayfasindan kargo saglayicisi eklenebilsin. DHL, DPD, GLS, UPS, FedEx, USPS, Go Exppress ya da saticinin istedigi özel bir kargo saglayicisi eklenebilsin. buraya ilgili apiler eklendikten sonra etiket basma, takip numarasi girme, kargoyu takip edip status güncelleme ve bildirme adimlari uygulanabilecek tabii ki.
- settings icine apps/integrations diye bir sekme acalim. orada istedigimiz tüm programlari, saaslari entegre edebilelim. mesela ben proje hazir oldugunda billbee entegrasyon sistemi hesabi baglamak istiyorum. birlikte billbee entegrasyon sistemi hesabi baglamayi test edebiliriz. xentral, jtl vs. bilimum yazilimla entegre olunabilsin. api anahtari ve api sifresi olusturulabilsin. ayrica ödeme yöntemi, versandart yada sayfanin herhangi bir yerinden yapilmis entegrasyonlar da burada LOGO - ISIM - AYARLAR, DETAY SAYFASI vs seklinde liste halinde gözükebilsin.