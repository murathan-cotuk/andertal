23.03.

-----------------------------------
11. MEDIA MANAGEMENT (SELLERCENTRAL)
-----------------------------------

- Media bölümüne ekle:
  - klasör oluşturma
  - kategori oluşturma
- Görseller organize edilebilmeli
- Her görsel için:
  - URL alınabilmeli

EK:
- URL ile eklenen görseller de media’da görünmeli


-----------------------------------
13. INVENTORY IMAGE BUG
-----------------------------------

- Sellercentral inventory sayfasında:
  - küçük image preview boş
→ ürün görselleri burada görünmeli

- shopta bir üründen 10dan fazla adet secilmiyor. cartta, productpagede, product card ta maximum order quantity gibi bir sinirlama olmasin. her yerde istendigi kadar eklenebilsin sepete.
- sellercentralde bir varyasyon optionuna swatch image ekleyince onu varyasyon ürününün ilk fotografi olarak da kabul ediyor. ürün fotosu size in sagindaki yer oldugu icin oraya etki etmemeli. oraya tiklayarak ürün eklenmeli. o kisimdan eklenen görselleri silebilme sansimiz da olmali.
- sellercentralde ürüne girdigimde ya da database de olan herhangi bir seye girdigimde (kategori, kolkesiyon, ürün, fotograf vs.) database de ne sekilde tanimlaniyorsa o gözükmeli. yani ID si yazmali sellercentralde urlde. yani bunu lütfen atlama burasi cok kritik. isim tanimli su anda ancak ben sürekli isim degistiriyorum urlde güncellenmiyor. database ile sürekli iletisim halinde kalinmasi lazim. o yüzde id kullanalim id hep sabittir.

YENI
-+siparisler sayfasinda fiyat gösterilirken vat de gözüksün. satis fiyati brüt yaziyoruz ya  
orada brüt fiyat/1,19 gözüksün zwischen netto preis olarak. sonra +steuer ya da her ülkede   
ne deniyorsa ve her ülkenin vergi orani ne ise ona göre + vergi eklensin. zaten ürünlerin    
fiyatlarini da ülkelere göre belirleyecegiz. ürünler sayfasinda ürünlerin icindeki           
fiyatlandirma bölümünü bence tab seklinde yapalim. yan yana ülkeler olsun. bastiginda kdv    
orani yazsin ve yan yana netto - brutto fiyatlar kismi olsun. aralarinda bir kilit olsun.    
bunlari birbirine baglayabilelim. mesela almanya icin konusuyorum. eger baglarsak birbirine  
netto fiyat yazdiginda otomatik olarak brüt fiyati netto*1,19 olarak güncellenecek. hepsinin kendi icinde indirimli fiyati, uvp fiyati falan gözüksün. tabii bu varyasyonlar icin de     
ayni olmali, varyasyonlarda belirlenen sku ya tiklandiginda ürünün icine girilmeli orada da  
görünmeli, overviweda da ayarlanabilmeli. ürün ismi, aciklamasi, bullet pointi, görseli,     
metafieldleri, yani acikcasi her yerde tab olmali ülke ülke. o yüzden simdi düsündüm de      
hepsinde ayri ayri olmasi yerine ürünün icine girdiginde en üstte view in shop kisminin      
soluna mevcut hangi dillerimiz var ise onlari yan yana yaz. bir ürün icin hangi dil          
secildiyse o veriler ona göre güncellensin. fiyatttir isimdir carttir curttur ayri ayri      
depolansin database de ve shopta da secilen dile göre hangi taba girdiysek o gözüksün.       
mesela ülke olarak ispanya secildi shopta hemen ispanyolca dil gözükecek, es tabi altinda    
girilen ürün bilgileri ve ispanya vergi orani falan gözükecek. ona göre brüt fiyat           
gözükecek. tabi shoptaki globe a basinda dropdown güncellenmeli artik. genis büyük bir       
dropdown insin söyle heybetli. solda country secici olsun, sagda language secici olsun.      
mesela isvicre icin isvicre frangi olmali sellercentraldeki ürün verisi para birimi. shopta  
dil almanca, para birimi frank olmali ülke isvicre secilince. 
- Siparis sayfasinda siparis listelerinin sagindaki 3 noktada iki tane markieren var. onlarin olmasini istemedim. ben direkt "Versenden" diye bir buton istedim siparisi göndermek icin. ayrica birden fazla siparis secilebilsin ve toplu bir sekilde gönderim yapilabilsin.
+
- shopta siparislerim sayfasinda siparislerin yaninda faturayi görmek istiyorum. kargoya verildiginde kargo takip numarasi da siparisin orada yer alsin. fatura olusturma modülü falan var stripe ta nasil yapilacaksa yap. yapmam gerekeni söyle. fatura icin nasil template hazirlayalim vs.
- sellercentralde siprisi versenden yapabilelim. versenden yaptigimizda kargo etiketi basilsin ve lieferschein basilsin. bunlari print edebilelim. kargo etiketi basildiktan sonra kargo takip numarasi hem sellercentralde ilgili orderda yazsin hem de shopta müsteriye fatura ve takip numarasi gitsin. toplu siparis versenden yapildiginda verandzentrum gibi bir sayfa acilsin ve orada sirayla siparisler ciksin. atiyorum ilk siparisin icinde 3 farkli ürün var. o 3 farkli ürünün barkodu scanlendiginde ya da manuel olarak eklendi, siradaki ürün tarzi bir butona basmak sureti ile siparisler islensin. billbee ve xentral tarzi.
- shopta müsteri siparisi iade et butonuna basabilsin. siparisin teslim edilme tarihi siparisin icinde olsun. teslimattan sonra 14 gün icinde retoure edebilir. 14 günü gecti ise maalesef iade edemezsin gibisinden bi uyari ciksin. 14 gün icindeyse de iade talebi bana gelsin sellercentralde retoure sayfasina düssün, talep incelendikten sonra onaylanirsa kargo etiketi basalim ve retourenschein ya da iade faturasi ya da yasal olarak gereklilik ne ise onlar basilsin. iade numarasi da basilsin ve gözüksün orderin icinde. bunlar tabii shopta müsterinin kontosunda görüntüleyebilecegi seyler olsun. 
- siparis tutarini iade etme butonu da olsun sellercentralde retoure de. paket bana ulastiktan sonra iade secenegini secelim. tam ya da kismi iade icin gerekli tutari girelim. iade et dedigimizde ödeme yapilan kaynaga tutar aninda iade olsun.
- kargo etiketi olusturmak icin vs tabii ki bir kargo saglayicisi entegre etmek gerekecek. https://belucha-sellercentral.vercel.app/tr/settings/shipping sayfasindan kargo saglayicisi eklenebilsin. DHL, DPD, GLS, UPS, FedEx, USPS, Go Exppress ya da saticinin istedigi özel bir kargo saglayicisi eklenebilsin. buraya ilgili apiler eklendikten sonra etiket basma, takip numarasi girme, kargoyu takip edip status güncelleme ve bildirme adimlari uygulanabilecek tabii ki.
- settings icine apps/integrations diye bir sekme acalim. orada istedigimiz tüm programlari, saaslari entegre edebilelim. mesela ben proje hazir oldugunda billbee entegrasyon sistemi hesabi baglamak istiyorum. birlikte billbee entegrasyon sistemi hesabi baglamayi test edebiliriz. xentral, jtl vs. bilimum yazilimla entegre olunabilsin. api anahtari ve api sifresi olusturulabilsin. ayrica ödeme yöntemi, versandart yada sayfanin herhangi bir yerinden yapilmis entegrasyonlar da burada LOGO - ISIM - AYARLAR, DETAY SAYFASI vs seklinde liste halinde gözükebilsin.