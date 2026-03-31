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

 
- ???shopta müsterinin siparis sayfasindan gönderdigi mesaj sellercentralde inbox sayfasinda cok güzel görünüyor. ancak gönderen müsterinin adi, email adresi, siparis numarasina ek olarak siparisin icerigi, tutari, siparisin durumu falan da gözükmeli. ayrica gelen mesaja benim verdigim cevap yukari dogru giiyor. yeni mesajlar asagi dogru siralanmali her zaman. inbox sayfasindaki beyaz pencereler sola hizalanmali ve daha genis olmali. müsteri shopta olusturulacak nachrichten tarzi bir sayfada gönderilmis mesajlari, caseleri basliklar seklinde görüntüleyebilmeli ve tikladiginda mesaj gecmisini görüntüleyebilmeli. bu sekilde bir sistem olustur.
- ???artik shoptaki landing page i kurabiliriz. konteyner konteyner ilerleyecegim. landing pagede headerin hemen altinda yapisik bir sekilde bir banner, hero section kismi olmali. slider olmali. birden fazla görsel eklenebilmeli. eklenecek görsellerin ölcüleri 3000x1000px ölcülerinde ve oranlarinda olmali. landing page e eklenen tüm konteynerleri, iceriklerini vs yönetebilmemiz icin sellercentralde content müsü altinda pages sayfasi icine landing page kismi ekle. bu landing page e tikladigimizda burada olusturacagimiz conteyner templatelerinden secip, siralayip, görselini metnini butonunu renklerini özellestirip kaydedebilelim ve shopta bu sekilde gözüksün. cms tarzi bir sey yani. hadi yap bakalim.
- ???bir varyasyon ürününe de metafields alaninda farbe ekledim. ancak bu filtrelerde görünmüyor. o secildiginde ilgili ürünün secili renge sahip varyasyonu gözükmeli. ayrica shopta ilk gösterilecek ürün varyasyonu varsayilan olarak hangi ürünün stogu var ise o gözükmeli. hepsinde varsa ilk varyasyon gözüksün. filtrelerde secili renk hangi varyasyondaysa o gözüksün. ayrica filtreyi seciyorum ancak 0 products diyor. nasil olabilir ki? ürün filtreyi secmeden önce orada ve onun icinde metafield eklendigini biliyorum cünkü filtrelerde cikiyor. filtreyi sectigimde sectigim ürünü varyasyonu secili halde göstermiyor