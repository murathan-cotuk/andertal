29.03.

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

 
- ???sellercentralde inbox sayfasinda solda gözüken konverstaionen kisminda müsteri ismi koyu puntoyla olmali siparis numarasi altta acik punto olmali. ayrica her konversation un sonuna yatay cizgi koy ki diger mesajlardan ayrilsin.
- ???sellercentralde landing-page sayfasi harika olmus. olusturdugum hero bannerdaki eklenen görsellere direkt tiklanabilsin butona gerek olmadan. ayrica baslik ve buton gibi iceriklerin rengleri, büyüklükleri ve banner üzerindeki konumlari buradan ayarlanabilsin. sag, sol, üst, alt, orta, sag üst vs... diye. ayrica eklenen görsellerin üstünde siyah bir katman var gibi duruyor. görsellerin renkleri koyulastirilmasin. 
- ???bild + text ve text konteynerleri de ekledim. buradaki text kismi yine html olarak ayarlanabilsin.
- ???bild-raster konteynerinde eklenen bildler ya kare ya dik ya yatay olarak görüntülenmesi secilebilsin. mesela örnek boytular: 1500x1500px , 1600x2600px, 3000x1000px gibi.
- ???shopta menüde filtreler en üstte satir olarak listelenmesin. onun yerine ürünlerin solunca bir sidebar gibi listelensin. amazon mantigi yani.
- ???CTA konteyneri bölümünde de konumlandirmalar secilebilsin.
- ???Sellercentralde inhalte menüsünün altinda "Styles" adinda bir submenü olusturalim. Burada websitesindeki ana renk, ikincil renk, ne bileyim buton stili ve daha onlarca istedigimizde degistirecegimiz stiller olsun eklenip degistirilebilsin. kodun icinde yok turuncu yok mor diye ayarlamak yerine buradan ayarlayalim. Su anda kullandigimiz butonlar neler ise onlarin kodunu oraya yaz. Mesela de ki "Add to cart button" ve ben buna bastigimda altinda html css kodu ciksin ya da sen her nasil ayarladiysan. react mi ayarladin next mi ayarladin bilmiyorum. buton stilini buradaki kodlari düzenleyerek yapabilelim. her bir özellik icin birden fazla tasarim ekleyebilelim. yanina da aktiv butonu koyalim istedigimizde istedigimizi aktiflestirebilelim.
- ???landing page sayfasinda ekleyebilecegimiz daha fazla konteyner templateleri ekle. bir tane koleksiyon ekleme konteyneri ekle. sayfaya ekleyelim, icinden koleksiyon secelim. o koleksiyon icindeki ürünler slider carousel olsun. yan yana kac ürün istedigimizi burada da belirtelim bild-raster de belirttigimiz gibi. 
- ???landing page sayfasindan bu landing page i hangi page icin yaptigimizi secelim. mesela ben sellercentralde /content/pages altinda Home Page adinda /# slug olan bir sayfa ekledim. /# yapma sebebim sonunda bir sey olmamasi. bu mesela bizim home landing page imiz ile tanimli olsun. landing page menüsü altindan Home Page sayfasini secip onun altina ekledigmiz konteynerlar o sayfada gözüksün. ne bileyim ileride baska bir sayfa ekleriz atiyorum impression. o zaman da landing page menüsünden impression sayfasini secip oraya konteynerleri ekleriz falan. cok iyi olur yap bunu.
- ???bir varyasyon ürününe de metafields alaninda farbe ekledim. ancak bu filtrelerde görünmüyor. o secildiginde ilgili ürünün secili renge sahip varyasyonu gözükmeli. ayrica shopta ilk gösterilecek ürün varyasyonu varsayilan olarak hangi ürünün stogu var ise o gözükmeli. hepsinde varsa ilk varyasyon gözüksün. filtrelerde secili renk hangi varyasyondaysa o gözüksün. ayrica filtreyi seciyorum ancak 0 products diyor. nasil olabilir ki? ürün filtreyi secmeden önce orada ve onun icinde metafield eklendigini biliyorum cünkü filtrelerde cikiyor. filtreyi sectigimde sectigim ürünü varyasyonu secili halde göstermiyor