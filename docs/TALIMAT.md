01.04.

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

- styles altinda ekledigimiz bilesenleri ayarlayabilelim bence. scroll up buton style ve rengi, top bar stili ve rengi, header stili ve rengi, second nav stili ve rengi, websitesi yazi tipi fontu rengi boyutu nerede nasil olacagi, h1 nasil h2 nasil secenekleri, birkac farkli buton tasarimi var onlar ayri ayri ayarlansin, footer arka plan rengi. bunlari güzelce kodda teplateleri kategorize et ancak koda sikisip kalmasin bu tarz seyler. sellercentralde yönetilebilsin tabii.
- ???sellercentral icin 2 tip kullanici olmasi gerekiyor. biri superuser/admin, biri normal user/seller. bunlarin ikisinin görecegi menüler farklilik gösterecek. super user her seyi görebilecek tabii ki ancak normal user yani seller her seyi yönetememeli. yoksa satici olarak kayit olan herkes sürekli sayfanin tasarimini degistirir. söyle yapalim. kodun icine bir yere superuser emaili tanimla. admin emaili ya da ne demek istersen. sellercentrale o sekilde giris yapalim. murathan.cotuk@gmail.com. bu email adresi ile olusturulan hesap superuser olacak. bu email adresi disindaki tüm hesaplar normal user olacak. superuser olarak giris yaptigimda baska superuser emailleri de ekleyebilmek isterim sellercentralde. nedir bu superuser ile normal user farki? normal userlar su menülere erisemeyecek: products/collections, content/menüs kategorien, landing page, styles, seiten, blogbeiträge. erisilebilecek tüm menüler saticilara özel olacak. mesela a saticisi kayit oldu 3 ürün ekledi. b kullanici gelip ürünler sayfasina baktiginda a kullanicisinin ekledigi ürünleri görememeli. bu tüm sayfalar icin gecerli. ancak superuser tüm saticilarin ekledigi her seyi görüntüleyebilecek. hatta yanlarinda hangi seller in oldugu belli olacak.
- ???superuser olarak giris yaptim. ancak baska bir kullanici ekleyemiyorum ya da ekleneni düzeltemiyorum users and permissions sayfasindan. verilecek permissionlari da kendim secebilmek isterim. hangi menülere erisip erisemeyecegini.               
seller olarak giris yaptim analyse altinda live-asicht görüyorum. sellerlarin görmemesi lazim.                                     
Analyse altina transactions diye bir menü eklememissin. iki kullanici tipi de görecekti ama ikisi de farkli görecekti önceki       
mesajda anlatmistim.                                                                                                               
seller olarak users&permissions menüsüne gelince only superusers falan diyor. Sellerlar bir superuser oldugunu asla bilmemeli ve   
onlar da bu sayfadan kendi selleracountlari icin user ekleyebilmeli.                                                               
settings/payments sayfasi icin ne yapmani istedigimi önceki mesajda anlatmistim. yapmamissin...                                    
shipping and delivery sayfasindaki versandkostenfrei ab degerini sellerlar görememeli. ayni sayfada baska bir kullanici tarafindan 
 tanimlanmis kargo metodlarini görüyorum.                                                                                          
bestellungen menüsüne basinca orders menüsüne gitmiyor. sadece dropdown menü aciliyor. ansicht tarzi bir alt menü ekle orada       
gözüksün siparisler.                                                                                                               
Seller olarak baska sellerlarin ve superuserin retourelerini görebiliyorum. sellerlar baskalarinin degerlerini görememeli diye     
belirtmistim.                                                                                                                      
verlassene warenkörbe menülerini sellerlar görüntüleyemesin.                                                                       
sellerlar baska sellerlarin inboxunu görebiliyor.                                                                                  
ya abi neden 300 kere ayni seyleri tekrar ettiriyorsun. iki mesajdir ayni seyleri yaziyorum. menüdeki tüm degerler sellerin        
kendisine ait. baska seller görememeli ya bu degerleri bu kadar basit. bi seller ürün ekler ise o seller hesabinda kalir ve shopa  
öyle listelenir. amazon gibi. hallet sunlari. orders menüsünü de unutma  
- superuser olmayan sellerlar müsterinin email adresini ve telefon numarasini görememeli. inbox sayfasindan müsteriyle iletisim kurabilmeli normal sellerlar sadece. 
- users & permissions sayfasini normal sellerlar da görebilmeli ancak sadece kendi seller accountlarina erisebilecek user ekleyebilmeliler. email adresi ve isim eklenecek, o email adresine davetiye linki gidecek. [seller] tarafindan davet edildiniz falan seklinde. o emaildeki davetiye ile kayit olusturulunca sadece davetin geldigi seller accounta erisim hakki kazanacak. hesap sahibi hangi yetkilere izin verirse o yetkilere erisebilecek.
- superuser da ayni normal seller gibi ekleyebilecek seller account ya da superuser account. seller superuser yapilabilecek. bir seller superuser yapildiginda menüleri falan komple verilen izinler sinirinda görebilecek davet edilen superuser ya da sellerden superusera evrilen account.     
- sellercentralde superuser olmayan yani normal seller olan saticilar yaptiklari satistan 10% oraninda komisyon ödeyecekler. Analysen altinda berichte, menüsü var, live-ansicht menüsünü göremesinler. oraya bir de transactions menüsü ekleyelim. burada saticilar yaptiklari satislari, ne kadara sattilar ne kadar komisyon kesildi kargo ücreti vergi iadeler cart curt hepsini detayli görebilsin hepsi detayli bir sekilde hesaplanabilsin. superuser da satici bazli transaction görebilsin. 15 günlük dönemlerde saticilarin hesabina yaptiklari satislarin ücretleri, komisyon tutarlari cekildikten sonra yatirilacak. bu tutarlar hesaplanirken teslim edilen siparislerin üzerinden 14 gün gecen siparislerin tutarlari yatirilacak sadece. teslimatin üzerinden 14 gün gecmeyen siparislerin parasi hesaplanmayacak cünkü iade edilebilir. iade edilen ürünler de transactionda belli olsun cünkü tabii ki komisyon alinmayacak. bu sayfada dönemsel olarak transactionlar görüntülenebilsin ve dönem sonunda satici ne kadar yatacagini görsün, superuser ise toplamda ne kadar geldigini, gönderilecegini, komisyon oranini görsün. hem toplamda görsün en üstte hem de satici bazli görünsün. bu ödemeler her ayin 1 i ile 15 i arasinda otomatik olarak gönderilsin. settings/payments sayfasini bu dogrultuda güncelle. bu sayfada super user saticilara gönderilecek paranin hangi hesaptan cikacagini belirtsin. super user satici, iban, tutar, gönderildi mi gönderilmedi mi?, gönderildiyse gönderi kaniti pdf olarak seklinde bir liste görsün asagida. gönderilen tutarlarda reference kismina saticinin ismi, satis periyodu gözüksün. saticilar ise hangi hesaba bu tutarin ödenecegini belirlesin.
- ???Sellercentralde inhalte menüsünün altinda "Styles" adinda bir submenü olusturalim. Burada websitesindeki ana renk, ikincil renk, ne bileyim buton stili ve daha onlarca istedigimizde degistirecegimiz stiller olsun eklenip degistirilebilsin. kodun icinde yok turuncu yok mor diye ayarlamak yerine buradan ayarlayalim. Su anda kullandigimiz butonlar neler ise onlarin kodunu oraya yaz. Mesela de ki "Add to cart button" ve ben buna bastigimda altinda html css kodu ciksin ya da sen her nasil ayarladiysan. react mi ayarladin next mi ayarladin bilmiyorum. buton stilini buradaki kodlari düzenleyerek yapabilelim. her bir özellik icin birden fazla tasarim ekleyebilelim. yanina da aktiv butonu koyalim istedigimizde istedigimizi aktiflestirebilelim.
- ???landing page sayfasinda ekleyebilecegimiz daha fazla konteyner templateleri ekle. accordion ve tab ile degisen metin sekmeleri ekle.
- ???bir varyasyon ürününe de metafields alaninda farbe ekledim. ancak bu filtrelerde görünmüyor. o secildiginde ilgili ürünün secili renge sahip varyasyonu gözükmeli. ayrica shopta ilk gösterilecek ürün varyasyonu varsayilan olarak hangi ürünün stogu var ise o gözükmeli. hepsinde varsa ilk varyasyon gözüksün. filtrelerde secili renk hangi varyasyondaysa o gözüksün. ayrica filtreyi seciyorum ancak 0 products diyor. nasil olabilir ki? ürün filtreyi secmeden önce orada ve onun icinde metafield eklendigini biliyorum cünkü filtrelerde cikiyor. filtreyi sectigimde sectigim ürünü varyasyonu secili halde göstermiyor