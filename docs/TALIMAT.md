03.04.

-- sellecentralde superuserlarin görebildigi content/landing-page safasinda eklenecek konteynerlere yenilerini ekleyelim. yeni konteynerlar teker teker söyleyecegim: 
+- tekli ürün ekleme
+- featured blog posts (eklenmis blog postlar carousel olarak gözükecek. blogpostlarin icine görsel de eklenecek görsel title ve text gözükecek acilabilecek)
+- newsletter abone olma container i. mailchim, klavio, brevo ya da baska bir sey entegre edecegim ve entegre calisacak.
+ 

-- sayfanin altindan acilip bar olarak gözükecek bir cookie kabul etme, reddetme, yönetme sistemi yap shop icin.
-- siteye trustpilot entegre edelim. sayfadaki yapilan yorumlar trustpilot ile entegre olsun. oraya da eklensin yorumlar ve ürünlerin altinda gözüken yorumlar trustpilot tasariminda gözüksün. trustpilot oldugu belli olsun yani.
-- styles altinda ekledigimiz bilesenleri ayarlayabilelim bence. scroll up buton style ve rengi, top bar stili ve rengi, header stili ve rengi, second nav stili ve rengi, websitesi yazi tipi fontu rengi boyutu nerede nasil olacagi, h1 nasil h2 nasil secenekleri, birkac farkli buton tasarimi var onlar ayri ayri ayarlansin, footer arka plan rengi. bunlari güzelce kodda teplateleri kategorize et ancak koda sikisip kalmasin bu tarz seyler. sellercentralde yönetilebilsin tabii.
yazi fontu secmek istiyorum. acilir menü acilsin ve orada tüm ücretsiz google fontlari olsun oradan sectigimiz degerler shopa yansisin. h1, h2, h3, h4, h5, normal textlerin nasil gözükeceklerini, fontlari, puntolari, kalin mi italik mi oalcagi, renkleri hepsini hepsi icin ayarlayabilelim


-- seller olarak giris yaptim ve users & permissions sayfasindan bir emaile davet attim. smtp bagli olmadigi icin tabii ki email gelmedi. ancak o email adresi ile register yaptim, store adina ayni store adini girdim ve yeni bir seller hesabi olusturdu. 
1) Bir store adi alinmisken ayni store adi ile baskasinin kayit olamamasi gerekirdi.
2) bir email adresi eger bir satici tarafindan davet edildiyse register yaptiginda direkt olarak daveti gönderen seller accountu ile baglanti kurmaliydi. bunlari düzgünce ayarla

-- shipping and delivery sayfasindaki versandkostenfrei ab degerini sellerlar görememeli. 
-- ayni sayfada baska bir kullanici tarafindan tanimlanmis kargo metodlarini görememeli sellerlar.
-- bestellungen menüsüne basinca hemen orders menüsüne yönlendirmesin. sadece dropdown menü acilsin. ansicht tarzi bir alt menü var orada. o ansicht menüsüne basildiginda /orders sayfasina gitsin. 
-- superuser olmayan sellerlar müsterinin email adresini ve telefon numarasini görememeli. inbox sayfasindan müsteriyle iletisim kurabilmeli normal sellerlar sadece. 
-- Sellercentralde inhalte menüsünün altinda "Styles" adinda bir submenü olusturalim. Burada websitesindeki ana renk, ikincil renk, ne bileyim buton stili ve daha onlarca istedigimizde degistirecegimiz stiller olsun eklenip degistirilebilsin. kodun icinde yok turuncu yok mor diye ayarlamak yerine buradan ayarlayalim. Su anda kullandigimiz butonlar neler ise onlarin kodunu oraya yaz. Mesela de ki "Add to cart button" ve ben buna bastigimda altinda html css kodu ciksin ya da sen her nasil ayarladiysan. react mi ayarladin next mi ayarladin bilmiyorum. buton stilini buradaki kodlari düzenleyerek yapabilelim. her bir özellik icin birden fazla tasarim ekleyebilelim. yanina da aktiv butonu koyalim istedigimizde istedigimizi aktiflestirebilelim.
-- landing page sayfasinda ekleyebilecegimiz daha fazla konteyner templateleri ekle. accordion ve tab ile degisen metin sekmeleri ekle.