KRİTİK (Production'a çıkmadan mutlaka düzeltilmesi gereken)

  *1. DONE JWT Secret Hardcoded
  server.js:3846 — JWT_SECRET env var yoksa 'belucha-seller-secret-2025' fallback kullanılıyor. Aynı secret hem seller hem customer token'ı  
  için kullanılıyor. Production'da bu secret bilinirse tüm hesaplar taklit edilebilir. Seller ve customer için ayrı, zorunlu env var'lar     
  olmalı.

  *2. DONE CORS Boşluğu
  CORS_ORIGINS env var ayarlanmamışsa production'da tüm origin'lere izin veriliyor (return null). Bu, API'ye herhangi bir domain'den istek   
  atılmasına olanak tanır.

  *3. DONE SSL Doğrulaması Kapalı
  Tüm DB bağlantılarında rejectUnauthorized: false var (Render.com tespiti için). Bu, database bağlantısında MITM saldırısına kapı açar.     

  *4. DONE JWT Ömrü 30 Gün
  server.js:3854 — Her iki token türü de 30 gün geçerli. Token çalındığında 30 gün boyunca geçerli kalır. Access token 15 dakika, refresh    
  token 7 gün olmalı.

  ---
  ÖNEMLİ (Kısa vadede ele alınması gereken)

  *5. DONE typescript: { ignoreBuildErrors: true }
  apps/shop/next.config.js:20 — TypeScript hataları build'de yakalanmıyor. Runtime crash'lere davetiye. apps/sellercentral/next.config.js'de 
  de aynı durum var mı kontrol edilmeli.

  *6. DONE 182 console. Çağrısı — Sadece Backend'de*
  Sensitive hata detayları, path bilgileri ve kullanıcı verileri production loglarına sızabiliyor. Pino zaten package.json'da var ama        
  kullanılmıyor; tüm console.log'ların pino'ya taşınması gerekiyor.

  *7. DONE Register Endpoint'inde Rate Limit Yok
  Login için authLimiter var (server.js:208), ancak /admin-hub/auth/register sınırsız. Spam kayıt saldırısına açık.

  *8. DONE Zod Package'ı Var, Hiç Kullanılmıyor
  package.json'da zod tanımlı ama backend'de input validation yok. Email format, EAN uzunluğu, fiyat aralığı gibi temel validasyonlar çıplak 
  string işlemiyle yapılıyor.

  *9. DONE Yarım Kalmış / Stub Sayfalar
  Sellercentral'da şu sayfalar içerik olarak boş:
  - BannersPage.jsx → "Banner management coming soon."
  - PlatformSettingsPage.jsx → "Platform settings coming soon."
  - AccountSettingsPage.jsx → TODO yorumu, implement edilmemiş
  - GoogleAdsPage, MetaAdsPage, PinterestAdsPage, TikTokAdsPage → sadece API key input'u var, gerçek entegrasyon yok

  *10. DONE Token'lar localStorage'da
  localStorage.setItem("sellerToken", ...) — XSS saldırısında token çalınabilir. httpOnly cookie ile saklanmalı.

  *11. DONE TOTP Secret Düz Metin DB'de
  2FA secret'ı totp_secret text kolonu olarak şifrelenmeden saklanıyor. Database sızıntısında 2FA atlatılabilir. Encryption at rest veya en  
  azından app-level şifreleme gerekir.

  *12. DONE Sitemap/robots.txt Klasör Yapısı Hatası
  apps/shop/src/app/robots.txt/ ve apps/shop/src/app/sitemap.xml/ klasör olarak var — içlerinde route.js var. Bu Next.js App Router
  convention'ına aykırı değil (route handlers için geçerli), ama URL sonuna .txt ve .xml gelmesi için route.js içindeki Response
  header'larının doğru ayarlanması şart. Kontrol edilmeli.

  ---
  İYİLEŞTİRME ÖNERİLERİ (Orta-uzun vadeli)

  *13. DONE Reklam Sayfaları Sadece Form — Backend Entegrasyon Yok
  Google Ads, Meta Ads, Pinterest, TikTok sayfalarında API key kaydediliyor ama bu key'lerle hiçbir şey yapılmıyor. Ya gerçek entegrasyon    
  yapılmalı ya da sayfalar kaldırılmalı — şu haliyle müşteriyi yanıltıcı.

  14. Checkout Form Validasyonu Zayıf
  Alman posta kodu formatı (5 haneli), telefon numarası, email regex doğrulaması yok.

  15. error.jsx Eksik (Shop)
  Next.js'de error.jsx olmadan 500 hataları graceful handle edilmiyor — kullanıcı boş sayfa görüyor.

  16. Bundle Optimizasyonu
  framer-motion, lenis, react-instantsearch gibi ağır kütüphaneler lazy load edilmiyor. Core Web Vitals etkilenebilir.

  17. Tek JWT Secret İki Amaç İçin
  SELLER_JWT_SECRET ve CUSTOMER_JWT_SECRET aynı env var'dan (JWT_SECRET) okunuyor. Ayrılmaları gerekir.

  18. DB Connection Pattern Tutarsız
  Bazı fonksiyonlarda finally { client.end() } var, bazılarında sadece catch'te çağrılıyor. Connection leak riski var.

  ---
  Öncelik Sırası

  ┌────────────────┬────────────────────────────────────────────────────────────────────────────────────┬──────────────┐
  │    Öncelik     │                                         İş                                         │ Süre Tahmini │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🔴 Kritik      │ JWT secret'ları ayrı ENV var'a taşı, production'da fallback'i hata olarak işaretle │ 30 dk        │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🔴 Kritik      │ CORS_ORIGINS üretimde zorunlu hale getir                                           │ 15 dk        │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🔴 Kritik      │ JWT ömrünü kısalt + refresh token mekanizması                                      │ 2-3 saat     │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🟠 Önemli      │ Rate limit register endpoint'ine ekle                                              │ 15 dk        │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🟠 Önemli      │ typescript: ignoreBuildErrors: false yap, çıkan hataları düzelt                    │ 1-2 saat     │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🟠 Önemli      │ localStorage yerine httpOnly cookie ile token sakla                                │ 2-3 saat     │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🟠 Önemli      │ Stub sayfaları bitir ya da "Yakında" banner'ı koy                                  │ 1 gün        │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🟡 İyileştirme │ Zod ile input validation                                                           │ 2-3 saat     │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🟡 İyileştirme │ pino ile logging standardize et                                                    │ 1 saat       │
  ├────────────────┼────────────────────────────────────────────────────────────────────────────────────┼──────────────┤
  │ 🟡 İyileştirme │ error.jsx ekle                                                                     │ 30 dk        │
  └────────────────┴────────────────────────────────────────────────────────────────────────────────────┴──────────────┘

  Hangisinden başlamak istiyorsun?