19.03.
----------------------------------
1. PRODUCT PAGE SCROLL (UX FIX)
-----------------------------------
- Ürün sayfasında aşağı scroll yapılınca ürün görseli hemen kaymamalı
- Görsel belirli bir süre (sticky gibi) sabit kalmalı
- Sağ taraftaki bilgiler scroll edebilir
- Modern e-commerce siteleri (Apple, eBay) gibi davranmalı

-----------------------------------
2. PRODUCT PAGE DESIGN
-----------------------------------
- Yerleşim doğru ama tasarım kötü ve minimal değil
- UI tamamen yeniden düzenle:
  - Daha fazla white-space
  - Daha sade font ve spacing
  - Butonlar ve varyasyonlar daha küçük ve modern
- Referans: eBay product page

-----------------------------------
3. VARIATION SYSTEM (CRITICAL BUG)
-----------------------------------
Şu an varyasyon sistemi yanlış çalışıyor.

İSTENEN DAVRANIŞ:
- Kullanıcı Color = Red seçti
- Sonra Size = S seçti
→ Sonuç: Red + S aynı anda seçili kalmalı

ŞU ANKİ HATA:
- Size seçince Color sıfırlanıyor

DOĞRU LOGIC:
- Seçimler birbirini silmemeli
- Her grup kendi state’ini korumalı
- Seçilen kombinasyona göre variant bulunmalı

EK:
- Stok yoksa seçenek:
  - disabled + üstü çizili
- Varyasyonlar:
  - Daha küçük
  - Yuvarlak (pill değil, compact)

-----------------------------------
4. VARIATION UI (SELLERCENTRAL)
-----------------------------------

Yeni yapı şu şekilde olmalı:

GROUP SETUP:
Add Group +

Group A: Color
- Schwarz
- Red

Group B: Größe
- S
- M
- L

AUTO MATRIX:
Schwarz:
  S
  M
  L

Red:
  S
  M
  L

ÖZELLİKLER:
- Gruplar reorder edilebilir olmalı
- Her varyasyona:
  - görsel (upload + URL)
  - SKU
  - EAN
  - stok
  - fiyat
  - UVP
  - indirim fiyatı
- Eğer sadece “Red” için görsel eklendiyse:
  → tüm Red varyantlarına otomatik uygulanmalı
- Ama istersek her varyant ayrı override edilebilir

KURAL:
- Ana ürün fiyatı kullanılmaz
- Her zaman varyant fiyatı baz alınır

-----------------------------------
5. SWATCH SYSTEM
-----------------------------------
- Color için swatch image kullanılmalı
- Shop’ta:
  - küçük görsel olarak göster
- Cart’ta:
  - seçilen varyantın swatch’ı görünmeli

-----------------------------------
6. DUPLICATE PRODUCT + URL FIX
-----------------------------------

ŞU AN:
- URL’de "copy" / "kopie" kalıyor
- Ürün adı değişse bile URL değişmiyor

İSTENEN:

SELLERCENTRAL:
- URL = product ID (unique, temiz)

SHOP:
- URL = slug(product name)
- İsim değişince URL de güncellenmeli

DUPLICATE:
- Yeni ürün = yeni ID
- Asla eski slug/copy kalmamalı

-----------------------------------
7. PRODUCT NAME BUG
-----------------------------------
- Sellercentral’da ürün isimleri farklı
- Shop’ta hepsi aynı gözüküyor

→ Bu mapping hatasını düzelt

-----------------------------------
8. RECOMMENDATION SYSTEM
-----------------------------------

“Sizin için önerilenler”:

ŞU AN:
- Random / collection bazlı

İSTENEN:
- Kullanıcının en çok ziyaret ettiği ürünlere göre

Eğer veri yoksa:
- fallback olabilir

-----------------------------------
9. RELATED PRODUCTS LOGIC
-----------------------------------

ŞU AN:
- Boş olsa bile carousel çıkıyor

İSTENEN:
- Eğer related products yoksa:
  → bu section hiç render edilmesin

-----------------------------------
10. SEARCH (SELLERCENTRAL)
-----------------------------------

ŞU AN:
- Çalışmıyor

İSTENEN:
- Global search:
  - ürünler
  - kategoriler
  - menüler
  - ayarlar
  - pluginler
- Sonuçlar kategorize edilmiş şekilde gösterilmeli

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
12. SHOP IMPROVEMENTS
-----------------------------------

- Ürün sayfasında görseller daha büyük olsun
- Category / collection sayfalarında:
  - yayınlanma tarihine göre sıralama ekle
- Search suggestions:
  - görseller görünmeli
- Cart:
  - varyasyonlar düzgün formatta gösterilmeli:

ÖRNEK:
COLOR: Schwarz
SIZE: M

-----------------------------------
13. INVENTORY IMAGE BUG
-----------------------------------

- Sellercentral inventory sayfasında:
  - küçük image preview boş
→ ürün görselleri burada görünmeli

-----------------------------------
14. COMING SOON TEXT
-----------------------------------

- “Pek yakında”:
  - butonun altında olmalı
  - aktif dile göre değişmeli
  - yanında yayınlanma tarihi olmalı

-----------------------------------

SON:
Her şeyi yaptıktan sonra:
- Edge case’leri kontrol et
- State bug kalmadığından emin ol
- UI’yi gerçekten minimal yap (şu an değil)

Yarım iş istemiyorum.

- shoptaki search bar bir tik daha kücülsün ve o bar incelsin bir tik. second bar bir tik kalin olsun ve oradaki menüler daha büyük puntolu yazilsin. 
- sellercentralde bir varyasyon optionuna swatch image ekleyince onu varyasyon ürününün ilk fotografi olarak da kabul ediyor. ürün fotosu size in sagindaki yer oldugu icin oraya etki etmemeli. oraya tiklayarak ürün eklenmeli. o kisimdan eklenen görselleri silebilme sansimiz da olmali.