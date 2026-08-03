6) sepete bi ürün ekledim ve sonra checkouta gittim. abandoned-checkouts sayfasinda gözüküyor bu. ancak flow tetiklenmedi ve abandoned checkout icin belirlenen süre sonrasinda emaili almadim.

8) sellercentralde siparise versand diyorum. /versand sayfasi aciliyor verpackungszentrumda siparisin icindeki ürünleri scanlememi ya da ürünü arayip bulmami isteyen bi kutu oluyor. oraya a yazip hinzufügen diyorum kabul ediyor direkt. ne alaka abi? sepetteki satin alinan gercek ürünün secilmesi ya da scanlenmesi gerekiyor. ayrica siparisler icinde yalnizca o seller in sattigi ürünün gözükmesi gerekiyor. A isimli seller in aldigi siparisin icinde B sellerinin ürününün de gözükmesi cok sacma olur. hem baskalarinin ürünlerini görüp kafa karismamali, hem de tutar fazla olacagi icin fazla komisyon almis olur. sadece kendi sattigi ürün gözüksün siparislerin icinde ki hem komisyon alirken kendi komisyonu olsun, hem de ürün gönderirken sadece kendi ürünlerini scanleyebilsin. ayrica rastgele bisey yazip hinzufügen diyince reddetsin amk. ya ean yazilsin ya sku ya da ürün adiyla aransin. asagida da yazdikca dropdown seklinde secenekler acilsin es zamanli. 

9) siparislerin saginda versenden ve etikett kaufen diye iki secenek var. böyle olmamali. yalnizca versenden almali. etikett kaufen e basildiginda icinde cikan fonksiyonlar da versenden e basildiginda ürünler scanlendikten sonraki adimda acilmali. yani lütfen adam akilli yap sunu iyice detayli analiz et incele. ayri ayri olmasi kafa karistirir. scanlenen ürünler sonrasi paket ölcüsü secimi, ölcülere göre sendcloudun gönderdigi fiyatlarin üstüne ekledigimiz bizim fiyatlar ile kargo paketi teklifleri gözükmeli. yalnizca dhl paket secenekleri gözükmeli simdilik. sonra satin alinabilmeli. tabii kendi kargo saglayicisi var ise onu entegre edebilir saticilar. orasi baska

---

# LIVE'A ÇIKIŞ PLANI

Amaç ilk aşamada kusursuz ve bütün özellikleri tamamlanmış bir marketplace kurmak değildir. Amaç, tek satıcıyla gerçek siparişlerin güvenli şekilde alınabildiği, gönderilebildiği, iptal/iade edilebildiği kontrollü bir pilot başlatmaktır. Aşağıdaki kapsam tamamlanana kadar yeni özellik eklenmeyecek.

## BENİM YAPACAĞIM İŞLER

1. İlk pilotta yalnızca anlaşmalı tek satıcının ürünlerini yayınlayacağım.
2. İlk pilotu yalnızca Almanya pazarıyla sınırlayacağım.
3. Satıcıdan şirket unvanı, adres, vergi numarası/USt-IdNr., IBAN, iade adresi, kargo yöntemi ve ürün verilerini eksiksiz alacağım.
4. Satıcının ürün fiyatlarını, stoklarını, KDV durumunu, EAN/SKU bilgilerini ve kargo gruplarını kontrol edeceğim.
5. Sendcloud'u şimdilik pasif tutacağım. Satıcı etiketi kendi DHL/Hermes/ERP sistemi üzerinden oluşturacak ve takip numarasını Sellercentral'a girecek.
6. Bonus puan ve kuponları pilot boyunca kapalı tutacağım veya yalnızca muhasebe ve settlement hesapları doğrulandıktan sonra açacağım.
7. Impressum, Datenschutzerklärung, AGB, Widerrufsbelehrung, satıcı sözleşmesi ve müşteri faturası metinlerini bir Alman e-ticaret/vergi uzmanına kontrol ettireceğim.
8. Stripe canlı hesap, webhook, banka hesabı ve iade yetkilerini kontrol edeceğim.
9. Gerçek düşük tutarlı en az üç sipariş vereceğim:
   - normal ödeme, gönderim ve teslimat;
   - müşteri iptali ve tam para iadesi;
   - iade talebi ve refund.
10. Her testte Shop, Sellercentral, Stripe, e-posta, stok, fatura, takip numarası ve payout tutarlarını karşılaştıracağım.
11. Kod veya veritabanına elle müdahale etmeden üç test siparişi tamamlanmadan reklam vermeyeceğim.
12. Testler başarılı olunca önce 5-10 kişilik kapalı pilot, ardından 10-20 gerçek siparişlik düşük trafikli soft launch yapacağım. Bundan sonra küçük reklam bütçesi açacağım.

## CLAUDE'UN KODDA YAPACAĞI İŞLER

Claude önce mevcut davranışı okuyup doğrulayacak, sonra aşağıdaki sırayla çalışacak. Kapsam dışı refactor, tasarım yenilemesi veya yeni özellik eklemeyecek. Her madde için ilgili backend ve frontend testlerini çalıştıracak ve sonucu kısa şekilde raporlayacak.

### P0 — LIVE ÖNCESİ MUTLAKA TAMAMLANACAK

1. Multi-seller sipariş ve ödeme sahipliğini tamamla:
   - `store_orders.seller_id` her siparişte platformu (`default`) temsil etsin.
   - Gerçek satıcı sahipliği `store_order_items.seller_id` üzerinden belirlensin.
   - PaymentIntent hiçbir zaman sepetteki ilk satıcıya Destination Charge olarak yönlendirilmesin; tahsilat platform Stripe hesabında gerçekleşsin.
   - Sipariş listesi, sipariş detayı, fulfillment, kargo, e-posta, payout, transaction ve yetki kontrollerinde `store_orders.seller_id` üzerinden satıcı sahipliği varsayımını kaldır.

2. Satıcı izolasyonunu doğrula:
   - Satıcı yalnızca kendi ürün satırlarını, kendi ürün tutarını ve kendi gönderim işlerini görebilsin.
   - Bir satıcı başka satıcının ürününü, cirosunu, müşteri dışı özel verisini veya gönderim işlemini göremesin/değiştiremesin.
   - Sellercentral sipariş listesi, detay, ürün tarama, kargo ve PDF endpoint'lerini doğrudan API çağrılarıyla da yetki testine tabi tut.

3. Para ve settlement hesabını tek kurala bağla:
   - Satıcı baz tutarı yalnızca kendi ürün satırlarının toplamı olsun.
   - Bonus puan ve superuser/platform kuponu tamamen platform tarafından finanse edilsin; satıcı netinden ve komisyon bazından düşülmesin.
   - Satıcı tarafından oluşturulan kupon yalnızca o satıcının ürünlerine uygulansın ve maliyeti yalnızca o satıcının settlement hesabına yansısın.
   - Komisyon, seller net, payout, transaction raporu ve commission invoice aynı hesaplama kaynağını kullansın.
   - Yuvarlama kuruş bazında deterministik olsun; Stripe tahsilatı ile sipariş toplamı birebir eşleşsin.

4. Fatura ve vergi belgelerini düzelt:
   - Multi-seller siparişte müşteri için satıcı başına ayrı fatura üret.
   - Her faturada yalnızca ilgili satıcının ürünleri, doğru satıcı unvanı/adresi/USt-IdNr. veya §19 bilgisi bulunsun.
   - Platform bonusu/platform kuponu ile satıcı kuponunu belgede birbirinden ayır.
   - Müşterinin ödemesi, faturalar, platform sübvansiyonu ve kargo toplamı matematiksel olarak uzlaşsın.
   - Provisionsrechnung yalnızca ilgili satıcının gerçek komisyon bazına göre oluşsun.
   - `%19` değerini her siparişe körlemesine uygulama; ürün/satıcı/vergi durumuna göre doğrulanmış veriyi kullan.

5. DAC7 ve raporlamayı satır bazlı yap:
   - DAC7 satıcı cirosunu `store_orders.seller_id` ve tüm sipariş subtotal'ından hesaplama.
   - İlgili satıcının order item tutarlarını ve satıcıya ait gerçek transaction sayısını kullan.
   - Payout, dashboard, analytics ve export sonuçlarının aynı satış verileriyle tutarlı olduğunu test et.

6. İptal, iade ve refund akışını doğrula:
   - Tam ve kısmi iadede doğru satıcı kalemlerini, komisyonu, payout'u, stoku ve bonus ledger'ını tersine çevir.
   - Stripe refund toplamı müşteriden tahsil edilen tutarı aşamasın.
   - Aynı webhook veya buton işlemi iki kez geldiğinde çift refund, çift stok artışı veya çift bonus hareketi oluşmasın.

7. Sipariş oluşturma güvenliğini doğrula:
   - Aynı Stripe webhook'u/checkout isteği iki kere işlense bile tek sipariş oluşsun.
   - Ödeme tutarı güncel sepet, indirim ve kargoyla uyuşmuyorsa sipariş oluşturulmasın.
   - Ödeme başarılı olup sipariş kaydı başarısız olursa tespit edilebilir bir recovery/log mekanizması olsun.

8. Fiyat ve stok güvenliğini doğrula:
   - Checkout sırasında fiyatı frontend'den kabul etme; veritabanındaki güncel listing/variant fiyatını kullan.
   - Stok yetersizse ödeme öncesi engelle.
   - Başarılı siparişte stok bir kez düşsün; iptal/iade kuralına göre bir kez geri eklensin.

9. Kritik webhook ve e-posta akışlarını doğrula:
   - Stripe webhook imzası zorunlu olsun ve idempotent işlensin.
   - Sipariş alındı, ödeme, gönderildi, teslim edildi, iptal ve iade e-postaları doğru müşteriye ve ilgili satıcılara bir kez gitsin.
   - E-postalarda doldurulamayan placeholder'lar `{PLACEHOLDER}` olarak görünmesin.

10. Üretim güvenliği ve gözlemlenebilirliği doğrula:
    - Production secret'ları repoda veya frontend bundle'da bulunmasın.
    - Müşteri ve seller endpoint'lerinde yetki kontrolleri zorunlu olsun.
    - Kritik ödeme/sipariş/refund/webhook hataları yapılandırılmış loglara yazılsın.
    - Sağlık kontrolü, veritabanı yedeği ve geri yükleme prosedürü doğrulansın.

### P1 — PİLOT ÖNCESİ TAMAMLANACAK

1. `/versand` ürün tarama akışını düzelt:
   - Rastgele metin kabul edilmesin.
   - Yalnızca siparişteki ilgili satıcıya ait gerçek ürün EAN, SKU veya seçilmiş ürün adıyla doğrulanabilsin.
   - Ürün adı aramasında yazdıkça dropdown açılsın; seçim yapılmadan ürün eklenmesin.
   - Siparişteki adet kadar tarama yapılmadan gönderim adımına geçilmesin.

2. Sendcloud'u gerçekten pasif hale getir:
   - `is_active=false` olduğunda backend Sendcloud rates, label purchase ve otomatik return-label çağrısı yapmasın.
   - Sellercentral'da Sendcloud etiket satın alma bölümü gizlensin.
   - Manuel DHL/Hermes/diğer taşıyıcı ve takip numarası girişi açık kalsın.
   - Önceden oluşturulmuş etiket ve takip bilgileri görünmeye devam etsin.

3. Manuel gönderim akışını tamamla:
   - Satıcı takip numarası ve taşıyıcı girmeden siparişi gönderildi sayamasın.
   - Gönderim kaydından sonra müşteri e-postası ve takip bağlantısı doğru oluşsun.
   - Teslimat durumu manuel veya entegrasyon webhook'uyla güncellenebilsin.

4. Abandoned cart akışını düzelt ve zaman ayarına göre tek e-posta gönderildiğini test et.

5. Shop ve Sellercentral'ın temel mobil/masaüstü akışlarında kırık link, boş ekran, sonsuz loading ve kullanıcıya gösterilen ham backend hatalarını düzelt.

### LAUNCH SONRASINA BIRAKILACAKLAR

1. Billbee ve JTL üzerinden otomatik sipariş, stok, tracking ve belge senkronizasyonu.
2. Sendcloud veya başka sağlayıcı üzerinden platformun otomatik DHL/Hermes etiketi satması.
3. Satıcıların kendi DHL/Hermes sözleşmelerini bağlaması.
4. Birden fazla satıcıyla geniş çaplı katalog ve reklam kampanyaları.
5. Gelişmiş kampanyalar, bonus puan, otomasyonlar, analitik ve tasarım rötuşları.
6. Satın almayı veya yasal/finansal doğruluğu engellemeyen bütün kozmetik hatalar.

## BİTİŞ KRİTERİ

Claude “hazır” demeden önce test kanıtı sunacak. Aşağıdakiler sağlanırsa pilot başlayabilir:

- Tek satıcılı üç gerçek sipariş kod/veritabanı müdahalesi olmadan tamamlandı.
- Normal teslimat, iptal/refund ve iade senaryoları başarılı.
- Stripe, sipariş, müşteri faturası, satıcı görünümü, komisyon ve payout kuruşu kuruşuna tutarlı.
- Satıcı yalnızca kendi ürünlerini ve tutarlarını görüyor.
- Kritik endpoint yetki ve idempotency testleri geçiyor.
- Açık P0 veya P1 hata bulunmuyor.

P2/P3 seviyesindeki kozmetik veya “olsa güzel olur” işleri launch tarihini ertelemeyecek; backlog'a yazılacak.