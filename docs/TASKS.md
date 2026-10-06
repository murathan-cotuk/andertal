# Yapılacaklar

İlk gerçek satışa kadar. Sıra bağımlılığa göre.

## 1. Shop vitrini

- [ ] Ana sayfa ve kategori sayfalarını mevcut görsel şablona göre düzenle (`docs/designs/Home-Picture-Template`, `docs/designs/claude-frontendfigma`).

Engel: SellerCentral’da landing kaydı anında yayınlanır. Hazır iş metni yoksa sayfa metni uydurulmaz.

## 2. Kategori ağacı

- [ ] Shop’ta kullanılacak kategorileri Excel import ile tamamla.

Engel: Canlı veritabanında yaklaşık 12.337 kategori zaten duruyor. Yeni dosyada aynı slug varsa satır güncellenir, ikinci kayıt açılmaz. Bu iş CSV import ile yapılmaz; kolon `name` değil `name_de`. Staging veritabanı yok, import doğrudan canlıya gider. Tam kategori listesini metadata ile çekmek bellek taşırır.

## 3. Satıcı kaydı

- [ ] Seçilen satıcıyla SellerCentral kaydı aç, superuser onayını ver, ödeme için IBAN’ı kaydet.

Engel: Payout için satıcı SC → Einstellungen → Zahlungen'da **Stripe-Auszahlungskonto** açmalı (Custom, recipient; Stripe sözleşmesini kendisi kabul eder) ve Stripe doğrulamasını tamamlamalı. Bunu yapmayan satıcıya otomatik ödeme gitmez; yalnızca superuser manuel havaleyi (gerçek referans ve tutar onayıyla) kaydedebilir. Ayrıntı: `docs/Odeme-Payout-Implementasyon.md`.

## 4. Ürünleri kategorize et

- [ ] Bu satıcının ürünlerini doğru kategoriye bağla.

Engel: Kategori bir kez kaydedilince değişmez. Yanlış kategori, ürüne yanlış uyumluluk alanlarını da kilitler. Kategori ağacı bitmeden bu adıma geçilmez.

## 5. Ürünleri yayınla

- [ ] Ürünleri fiyat, stok, görsel ve zorunlu alanlarla shop’ta listele.

Engel: Her ürün, kategorisi ne olursa olsun üç GPSR alanı (üretici, üretici bilgisi, sorumlu kişi) dolmadan kaydedilemez. Yayın sonrası shop önbelleği yenilenmezse `REVALIDATE_SECRET` ile `STOREFRONT_PUBLIC_URL` eşleşmiyordur.

## 6. Stripe’ı canlıya al

- [ ] Canlı yayınlanabilir anahtar ve gizli anahtarı platform ödeme ayarına yaz.
- [ ] Stripe canlı webhook’unu bağla; `STRIPE_WEBHOOK_SECRET` değerini aynı canlı uç noktadan al.
- [ ] Connect webhook uç noktasını ekle (payout.*, account.updated; “Events on Connected accounts”) ve `STRIPE_CONNECT_WEBHOOK_SECRET` olarak kaydet. Olay listesi: `docs/Odeme-Payout-Implementasyon.md` §11.
- [ ] Stripe Dashboard’da platformun Custom/recipient connected account kullanmaya yetkili olduğunu doğrula.

Engel: Gizli anahtar veritabanında (`store_platform_checkout`), webhook sırrı ortam değişkeninde. Biri test, biri canlı kalırsa kart çekilir ama sipariş onaylanmaz. İlk geçiş gerçek para hareketidir.

## 7. İlk gerçek sipariş

- [ ] Küçük tutarlı bir siparişle ödemeyi, webhook’u ve satıcı hakediş kaydını doğrula.

Engel: Bunu 5 ve 6 bitmeden yapma.

## Bu listeye alınmayanlar

Affiliate ödemeleri vergi incelemesi bitene kadar kapalı; ilk satışa engel değil. Kategorilere toplu SEO metni yazılmayacak. Sunucu tarafı stil gecikmesi ve CDN hız işidir, satış kapısı değil.
