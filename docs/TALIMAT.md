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

- sepete bi ürün ekliyorum. sellercentralde bu ürünün almanca adina a demisim, iniglizce adina b demisim. shopta almanya secip sepete ekliyorum. dil ya da ülke secince sepetteki ismi a olarak kaliyor. ancak ingilizceye gecinde sepette ve checkoutta degistirsem bili ismi de o dile göre güncellenmeli.

- shopta kayitli ödeme yöntemleri
- shopta orders sayfasinda siparislerin yaninda iade et tarzinda falan bir buton olsun. shopta müsteri siparisi iade et butonuna basabilsin. siparisin teslim edilme tarihi siparisin icinde olsun. teslimattan sonra 14 gün icinde retoure edebilir. 14 günü gecti ise maalesef iade edemezsin gibisinden bi uyari ciksin. 14 gün icindeyse de iade talebi bana gelsin sellercentralde retoure sayfasina düssün, talep incelendikten sonra onaylanirsa kargo etiketi basalim ve retourenschein ya da iade faturasi ya da yasal olarak gereklilik ne ise onlar basilsin. iade numarasi da basilsin ve gözüksün orderin icinde. bunlar tabii shopta müsterinin kontosunda görüntüleyebilecegi seyler olsun. 
- siparis tutarini iade etme butonu da olsun sellercentralde retoure de. paket bana ulastiktan sonra iade secenegini secelim. tam ya da kismi iade icin gerekli tutari girelim. iade et dedigimizde ödeme yapilan kaynaga tutar aninda iade olsun.

- ???sellercentralde sagda dil secici ve profil menüsü butonu yan yana duruyor ama ayni hizada  
degil. daha da hizala. dil secicinin soluna bildirimlerin göründügü bir zil iconu koy.       
buraya gelen siparisler, iade talepleri vs gibi bildirimler eklensin. onun soluna da bir     
posta iconu koy müsteri ile mesajlar burada gözüksün. sellercentralde ve shopta siparsilerin 
 yanina da ayni iconu koy. müsteriye ya da saticiya bu sekilde mesaj yollanabilsin. bu mesaj 
 kutusuna gelen ve giden mesajlarin gelecegi ve gidecegi email adresi settings/general       
sayfasinda belirttigimiz adres olsun. smtp ayarlarinin yapilmasi gerekecek tabii ki onu da   
makul bir yerden yapalim. apps& integrations menüsü altindan google, outlook icin falan smtp 
 ayarlari yapabilmek icin ilgili seyleri eklersin.                                           
globe iconu: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"         
stroke-width="1.5" stroke="currentColor" class="size-6">                                     
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0           
8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 
 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997  
0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686  
0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12            
16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113             
1.157-4.418" />                                                                              
</svg>                                                                                       
                                                                                             
Bunun beyazi olsun.                                                                          
                                                                                             
mesaj butonu iconu: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"  
stroke-width="1.5" stroke="currentColor" class="size-6">                                     
  <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0     
1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 
 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36      
0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />                                              
</svg>                                                                                       
                                                                                             
beyazi olsun tabii.  