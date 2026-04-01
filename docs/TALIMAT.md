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
 
- ???Sellercentralde inhalte menüsünün altinda "Styles" adinda bir submenü olusturalim. Burada websitesindeki ana renk, ikincil renk, ne bileyim buton stili ve daha onlarca istedigimizde degistirecegimiz stiller olsun eklenip degistirilebilsin. kodun icinde yok turuncu yok mor diye ayarlamak yerine buradan ayarlayalim. Su anda kullandigimiz butonlar neler ise onlarin kodunu oraya yaz. Mesela de ki "Add to cart button" ve ben buna bastigimda altinda html css kodu ciksin ya da sen her nasil ayarladiysan. react mi ayarladin next mi ayarladin bilmiyorum. buton stilini buradaki kodlari düzenleyerek yapabilelim. her bir özellik icin birden fazla tasarim ekleyebilelim. yanina da aktiv butonu koyalim istedigimizde istedigimizi aktiflestirebilelim.
- ???landing page sayfasinda ekleyebilecegimiz daha fazla konteyner templateleri ekle. accordion ve tab ile degisen metin sekmeleri ekle.
- ???bir varyasyon ürününe de metafields alaninda farbe ekledim. ancak bu filtrelerde görünmüyor. o secildiginde ilgili ürünün secili renge sahip varyasyonu gözükmeli. ayrica shopta ilk gösterilecek ürün varyasyonu varsayilan olarak hangi ürünün stogu var ise o gözükmeli. hepsinde varsa ilk varyasyon gözüksün. filtrelerde secili renk hangi varyasyondaysa o gözüksün. ayrica filtreyi seciyorum ancak 0 products diyor. nasil olabilir ki? ürün filtreyi secmeden önce orada ve onun icinde metafield eklendigini biliyorum cünkü filtrelerde cikiyor. filtreyi sectigimde sectigim ürünü varyasyonu secili halde göstermiyor