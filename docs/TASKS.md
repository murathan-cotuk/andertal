# Görev Listesi

17.07

1) Test müsteri hesabimdan test siparis verdim. Siparis email flowu cok güzel calisiyor. Saticiya gelen emailde satin alinan ürün görseli gözükmüyor. Saticiya giden emailde görsel gözüküyor ancak müsteride gözükmüyor. bunu düzelt. — **Durum: ✅ Yapıldı.**

2) Siparis verildiginde status hemen in bearbeitung oluyor. hemen olmamali. ilk önce status offen olmali. siparisin icine girip ürünleri scanlemeye basladigimizda siparis durumu in bearbeitung olmali. Bunun icin de bi email template flow hazirla. yani su anki siparisiniz alindi flowu siparis ilk verildiginde yani durumu offenken gönderilecek flow template i. yeni olusturacagin template ise siparis durumu in bearbeitung olacagi zaman gönderilecek template. — **Durum: ✅ Yapıldı.**

3) müsteilere gönderilecek email templatelerde PDF-Anhänge (dieser E-Mail-Schritt) diye bir alan var. buradan bu email ile gönderilmesini istedigimiz dosyalar secilebiliyor. diger flow templatelerde bu kisim yok. her template de pdf anhang ekleme bölümü koy. yeni olusturacagina da mevcutlara da. — **Durum: ✅ Yapıldı.**

4) siparis verildikten sonra siparis aldindi diye bi onay sayfasi gözüksün. 4 saniye sonrasinda siparislerim sayfasina yönlendirsin. — **Durum: ✅ Yapıldı.**

5) Biliyorsun ki müsteriye bonus puan veriyoruz ve müsteri bu puanlari sonraki alisverislerinde bozabiliyor. su an 25 bonus puana 1 euro indirim kazaniyor. ancak bunu 50 bonus puanda 1 euro olacak sekilde ayarlayalim lütfen sellercentral ve shopun her yerinde. — **Durum: ✅ Yapıldı.**

6) eger müsteri bir entegrasyon sistemi yahut bir erp vb. bir sistem kullanarak siparislerini islediyse sistemde gözüken ve müsteriye gönerilen fatura müsterinin kendi sisteminde belirleyip andertale api yolu ile gönderdigi fatura olmali. bu sadece fatura icin gecerli degil. lieferschein, retourelabel vs dosyalar ve bilgiler de bu sekilde müsteri tarafindan gelmeli. müsteriler hangi dosyalari kullanmak istediklerini kendileri sececekler. dilerlerse elbette bizim dosya taslaklarimizi da kullanabilirler. saticilarin bu tercihi nasil yapabileceklerine dair en ufak fikrim yok. amazon nasil yapiyorsa onun gibi sisteme entegre et bu modeli. — **Durum: 🟡 Kısmen yapıldı** (sadece backend iskeleti var — tablolar + connector arayüzü; satıcı tarafı seçim ekranı, canlı JTL/Billbee bağlantısı ve müşteri push API'si henüz yok).

7) register olurken email yazildiginda böyle kayitli bir hesa var desin direkt mail girme kutusu altinda. register a basmayi beklemesin. — **Durum: ✅ Yapıldı.**

8) yeni siparis geldi baska bir seller ürününden. ancak superuser a bildirim gelmedi. — **Durum: ✅ Yapıldı.**

9) sellercentralde siparisler icine giriyorum. gelen siparis icin versandetikett kaufen diyorum. "Aus technischen Gründen konnte die Aktion nicht abgeschlossen werden. Unser Team wurde informiert und kümmert sich darum." hatasi veriyor. entegrasyon sorunu mu var? ne ise bul hallet. — **Durum: ✅ Yapıldı.**

10) siparislerin yaninda versenden ve etikett kaufen diye ayri iki buton olmasin. etikett kaufen butonu, versendene basildiginda acilan pencerenin icinde olsun. versenden dedikten sonra direkt gönder diyebiliyoruz ancak ilk önce siparis edilen ürünler tek tek scanlenmeli. o sekilde bir sayfa acilsin. atiyorum 6 farkli ürün siparis edildi farkli adetlerde 2,5,1 gibi. önce bir ürün acilsin yaninda tutar yazsin. scanleyince ilerlesin sürec ya da pakete kondugunu manuel sekilde onaylayalim buton ile. versenden yapildiktan sonra — **Durum: ✅ Yapıldı.**

11) Checkoutta Adres otomatik doldurma yaptiginda tüm adres straße ye yaziliyor. her yere ayri ayri doldurmali otomatik. — **Durum: ✅ Yapıldı.**

12) Register sayfasında almanca seçiliyken register oldum ama email ingilizce geldi. Newsletter de registry emaili de. — **Durum: ✅ Yapıldı.**

13) Mobilde meine bestellungen sayfasına gidip siparişi aşağı açabiliyorum. Ancak orada ürüne tıkladığımda ürün sayfasına gitmiyor. Ayrıca sipariş içine giremiyorum. — **Durum: ✅ Yapıldı.**

14) sellercentralde orders sayfasinda icerikler ekrana sigmiyor. daha kompakt yap. sütun genislikleri tutup sürükleyip özellestirilebilsin excel gibi. sütünlar gizlenebilsin sag üstten columbns tarzi bir dropdown ile. — **Durum: ✅ Yapıldı.**

15) flowlardaki bestellung versendet flowunun tetikleyicisi ne bilmiyorum. ancak siparisin lieferstatusu versendet oldugu zaman bu flow tetiklenmeli. — **Durum: ✅ Yapıldı.**

16) Bestellung geliefert flowu siparis icindeki Sendungsverfolgung kismi altinadki kargo takip güncellemelerinde "Zugestellt" gözüktügünde tetiklensin. — **Durum: ✅ Yapıldı.**

17) customers/newsletter sayfasinda newsletter a abone olanlari göremiyorum. — **Durum: ✅ Yapıldı.**

18) customers/reviews sayfasinda sellerlara göre kategorize edelim. ancak en üstte superuser bilgileri olsun tabii. — **Durum: ✅ Yapıldı.**

19) sellers/errors sayfasindaki sorunlari tek tek incele ve cöz. — **Durum: ✅ Yapıldı.**

20) content/brands/authorizations sayfasi bos duruyor. ayrica brand sayfasi icinden yapabilelim bunu. autorization islemleri ile brandler ayni ekranda olmali. ekranin üstünde dogrulama islemi kayit islemi olsun altta da liste olsun. 1 sayfada 100 marka olsun. 1 satirda yan yana 4 tane 25 satir seklinde. brand autorizations kaldiriyorsun yani. brand icine kuruyorsun. — **Durum: ✅ Yapıldı.**

21) shopa girdim sepete ürün ekledim. satin almadan ciktim. abandoned checkouts sayfasina baktim. evet orada gözüküyor. ancak Kunde kisminda ve E-Mail kisminda hicbir sey yazmiyor. her abandoned checkouts satirinin en saginda durum belli olsun. bu sepetteki ürünler silindi mi, satin mi alindi, hala sepette duruyor mu o yazsin. hala sepette duruyorsa zaten flow calisacak. satin alindiysa satin alinanlar sekmesine gidecek. silindiyse sepetteki ürünler silinenler sekmesine gidecek. hala sepettekiler sepettekiler sekmesine gidicek. all sekmesinde hesi gözükecek. email ve müsteri adi cok önemli dedigim gibi. cünkü email gidecek. flow hazirlandi. — **Durum: ✅ Yapıldı.**

22) marketing/automations sayfasi menüde gözükmüyordu, superuser icin görünür yapildi. — **Durum: ✅ Yapıldı.**

23) marketing/automations sayfasinda ayri bir "flow olusturma" (automation rule) sistemi vardi — content/flows'tan bagimsiz, kendi toggle/config kartlariyla (store_automation_rules). Kullanici: bu sayfa flow OLUSTURMASIN, sadece content/flows'taki gercek flow verisini raporlasin. Ayrica: flows sayfasina "reorder reminder" template'i eklensin; favorilenen ürünün stogu 10'un altina düstügünde email gönderen flow eklensin; favorilenen ürünün fiyati düstügünde hemen email gönderen flow eklensin. — **Durum: ✅ Yapıldı.** (Yeni flow şablonları bir sonraki backend deploy'unda otomatik oluşturulacak, taslak durumda — superuser etkinleştirmeli.)

24) mobilde shopu actim ve ana sayfaya kisayol olusturdum. ancak hic profesyonel durmuyor. insanlar siteye girip kesin kacarlar siteden. senden bir seyler düzeltmeni isteyecegim ancak bunlar disinda da siteyi kontrol et. amatörce duran yerlerde sen de ufak degisiklikler yap. simdi bu sekilde actigim icin mobilde sanki bir mobile app mis gibi gözüküyor. bu sitenin mobile app versiyonunu düzeltiyormusuz gibi düsünebilirsin.
- search bar üstünde bi bosluk var ya mobilde hani. saat, sarj, sebeke durumu falan gözüküyor. orasi dümdüz yesil gözüküyor. bu rengi nereden ayarliyorsun bilmiyorum ancak burasi sabit olmamali. mobilde bu renk, header rengi o an ne ise o sekilde gözükmeli ve gradiente dahil olmali. yani eger sellercentralden gradient secilmis ise direkt olarak bu kismin en üstünden second nav a kadar ilerlemeli. eger gradient secilmemisse navbarin rengini almali sabit bir sekilde. bu cok kritik.
- ikinci olarak mobilde sayfada duruyorum. en üstteyim mesela. sonra yukari kaydiriyorum özellikle ve ekranin altindaki menü yukari hareket ediyor. mesela bu cok yanlis. bu menü asla ve kat'a hareket etmemli. orada sabit durmali. yalnizca sepet, menü gibi sidebarlar acildigi zaman onlarin altinda kalmali z ekseninde. bu zaten böyle. ancak o bar ASLA AMA ASLA hareket etmemeli.
- siparis verildikten sonra bi bekleme süresi oluyor. orada yine kamyon ilerleyen bekleme ekrani gözüksün. siparis ver dedikten sonra yükleme ekraninda o gözüküyor zaten. siparisi verdikten sonra da orders sayfasi acilana kadar o bekleme ekrani gözüksün. hem mobil hem desktopta bu tabii.
- product cardlarda vs favorilere ekleme kalp simgesi sag altta olsun. sag üstte duruyor su anda ancak sag üstte sale batch i de var. alt alta kötü oluyor. sale batch i cardlarin eeeen üst eeen sag kösesinde durmali. zaten bunun icin sellercentralde batch ayarlamak icin bi sayfa yaptik orada güncelleriz ama bu cok önemli.
- search bar yanindaki logo cok kücük duruyor mobilde. sellercentralde content/styles sayfasindan mobile logonun size ini büyütmeme ragmen büyümüyor ve orada kücücük duruyor. padding 0 olmasina ragmen search bar ile ekranin solu ile arasinda hala bosluklar var vs. hakkini vererek yapar misin lütfen cünkü bu ayarlar asla dogruyu yansitmiyor. beni kandiriyorsun. search bar ile globe iconu arasinda bu kadar bosluk olmasina gerek yok mesela.

**Durum: ✅ Yapıldı** (tüm alt maddeler — status bar rengi, alt menü sabitliği, kamyon animasyonu, kart rozet çakışması, logo/boşluk düzeltmeleri).
