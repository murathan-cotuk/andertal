# Idealo Entegrasyonu — Yol Haritası (Senaryo 1: Ürün Besleme / Fiyat Karşılaştırma)

## Neden bu senaryo?

Idealo bir **fiyat karşılaştırma sitesi**dir (Google Shopping'e benzer), Amazon/eBay gibi bir "pazaryeri" değildir. Müşteri Idealo'da ürünleri karşılaştırır, tıklar, **doğrudan bizim shop'umuza gelir** ve alışverişi orada tamamlar. Yani:

- Sipariş bizim sisteme **geri akmaz** — normal bir shop siparişi olarak zaten bizim checkout'umuzdan geçer.
- Tek yönlü bir entegrasyon: biz Idealo'ya **düzenli olarak bir ürün listesi (feed)** göndeririz, onlar bunu kendi sitelerinde gösterir.
- Idealo tıklama başına ücret alır (CPC — Google Ads mantığına benzer).

Bu, projedeki mevcut Billbee/JTL "connector" mimarisinden (`apps/medusa-backend/src/connectors/`) tamamen farklı ve çok daha basit bir iştir — o mimariye hiç dokunmuyoruz.

---

## BÖLÜM A — SENİN YAPACAKLARIN (hesap, sözleşme, Idealo paneli)

Hiçbir teknik bilgi gerektirmez, sırayla ilerle. Kod tarafı (Bölüm B) paralelde bitmiş olacak, sen panelde ilerleyip feed URL'sini isteyeceğin an ben sana veririm.

### A1. Idealo "Händler" (satıcı) hesabı aç — ~20 dk
1. https://www.idealo.de/haendler (veya "idealo für Händler / idealo Partner" araması ile bulacağın resmi sayfa) adresine git.
2. "Jetzt Händler werden" / "Kostenlos registrieren" benzeri bir buton olacak, tıkla.
3. Firma bilgilerini gir: firma adı (Andertal / şirket unvanınız), adres, **KDV/Steuernummer (VAT ID)**, İmpressum bilgileri (web sitenizdeki Impressum sayfasıyla aynı olmalı — Almanya'da bu zorunlu).
4. Banka/fatura bilgilerini gir (tıklama başı ücretlendirme için ödeme yöntemi istenecek — kredi kartı veya SEPA).
5. Kayıt tamamlanınca bir onay maili gelecek, bazen manuel bir inceleme süreci olabilir (birkaç gün sürebilir).

### A2. Kategori eşleştirme dosyasını iste — ~5 dk
Idealo'nun kendi ürün kategorileri var (bizim admin panelindeki kategorilerden farklı). Hesap onaylandıktan sonra:
1. Idealo Händler panelinde (veya onlarla yazışarak) **"Kategorie-Mapping-Liste"** / kategori listesini iste — genelde bir Excel/CSV dosyası olarak verirler, her kategorinin bir Idealo Kategorie-ID'si vardır.
2. Bu dosyayı bana ilettiğinde, ben bizim kategorilerimizle eşleştirme tablosunu kodda hazırlarım (Bölüm B3).

### A3. Feed URL'sini panelde tanımla — ~10 dk (kod tarafı bitince)
1. Ben sana bir URL vereceğim, örn: `https://api.andertal.com/idealo-feed.xml`
2. Idealo Händler panelinde "Produktdaten" / "Feed" / "Content" bölümünde bu URL'yi ekle.
3. Feed'in ne sıklıkla çekileceğini seçebilirsin (genelde günlük, bazen daha sık seçenek olur).

### A4. Test/onay süreci — ~1-3 gün (Idealo tarafında bekleme)
1. Idealo feed'i ilk çektiğinde otomatik doğrulama yapar: zorunlu alanlar eksik mi, format doğru mu, kategori eşleşmesi var mı gibi.
2. Panelde bir "Testbericht" / hata raporu görürsün. Hata varsa bana bildir, ben feed'i düzeltirim.
3. Onaylanınca ürünler Idealo'da (genelde 24-48 saat içinde) görünmeye başlar.

### A5. Bütçe / tıklama fiyatı ayarla — ~10 dk
1. Panelde her kategori/ürün için maksimum tıklama başı ücret (CPC) belirlenir, ya da genel bir günlük bütçe.
2. Başta düşük bir bütçe ile başlamanı öneririm, performansı görüp artırırsın.
3. Bunu tamamen sen yönetirsin — bu bir pazarlama/bütçe kararı, kodla ilgisi yok.

### A6. Canlı takip
- Idealo panelinde "kaç tıklama, kaç maliyet" gibi raporlar olur — düzenli kontrol etmen faydalı olur.
- İleride istersen (Bölüm B7, opsiyonel) hangi Idealo tıklamasının gerçek satışa dönüştüğünü bizim sistemde de görebiliriz.

---

## BÖLÜM B — BENİM (AGENT) YAPACAKLARIM (kod tarafı)

### B1. Yeni feed endpoint'i
- **Yeni dosya:** `apps/medusa-backend/src/routes/idealo-feed.js`
- Yayınlanmış (`status='published'`), stokta olan ürünleri veritabanından çekip Idealo'nun istediği XML formatında (`<?xml version="1.0"?><products><product>...</product></products>` tarzı) üreten bir GET endpoint.
- `server.js`'e mount edilecek, herkese açık (auth gerektirmeyen) bir URL: `/idealo-feed.xml`. Mevcut `/store/categories`, `/store/collections` gibi public store route'larının yanına eklenecek (`store-public.js` ile aynı desende, ayrı dosyada — okunabilirlik için).

### B2. Alan eşleştirmesi (Idealo alanı ← bizim veri kaynağımız)
Gerçek bir ürünü inceledim, şu eşleştirme netleşti:

| Idealo alanı | Bizim kaynağımız |
|---|---|
| Ürün ID | `admin_hub_products.id` |
| Başlık | `metadata.translations.de.title` (yoksa `title`) |
| Açıklama | `metadata.translations.de.description` (yoksa `description`) |
| Fiyat (brüt) | `metadata.prices.DE.brutto_cents` (yoksa `price_cents`) |
| EAN/GTIN | `metadata.ean` |
| Hersteller (marka) | `metadata.hersteller` |
| Kategori | `metadata.category_id` → **Idealo Kategorie-ID eşleştirme tablosu** (Bölüm B3) |
| Görsel | `metadata.media[0]` |
| Ürün linki (deep-link) | `https://shop.andertal.com/{market}/{lang}/{handle}` (mevcut `menuItemHref`/`absoluteStorefrontUrl` mantığıyla aynı) |
| Stok durumu | `inventory > 0` → "verfügbar" / "nicht verfügbar" |
| Kargo ücreti | `metadata.shipping_group_id` üzerinden mevcut kargo ücreti hesaplama mantığı (Sendcloud entegrasyonundaki fiyatlandırmayla aynı kaynak) |
| Grundpreis (birim fiyat) | Almanya'da bazı kategorilerde zorunlu (Preisangabenverordnung) — `metadata`'da ölçü birimi varsa hesaplanacak, yoksa alan boş bırakılacak (Idealo bu durumda ürünü reddedebilir; A4'teki test raporunda göreceğiz) |

### B3. Kategori eşleştirme tablosu
- Sen Idealo'dan kategori listesini alınca (A2), yeni bir DB tablosu **`admin_hub_idealo_category_map`** oluşturacağım: `andertal_category_id → idealo_category_id`.
- Sellercentral'da basit bir eşleştirme ekranı ekleyeceğim (Content → Idealo Kategorileri gibi), her kategori için Idealo ID'sini seçebileceğin bir liste.
- Eşleştirilmemiş kategorideki ürünler feed'den otomatik hariç tutulacak (Idealo'nun reddetmesindense, hiç göndermemek daha güvenli).

### B4. Zorunlu alan kontrolü + mevcut compliance sistemiyle bağlantı
- Projede zaten bir uyumluluk motoru var (`metadata.compliance_review`, `resolve-compliance.js`) — enerji etiketi gerektiren ürünlerde EPREL/WEEE numarası eksikse bunu zaten tespit ediyor.
- Feed'i üretirken: EAN'ı olmayan, kategorisi eşleştirilmemiş, veya compliance kontrolünden geçmeyen ürünleri **otomatik olarak feed'den çıkaracağım** — böylece Idealo'nun reddetmesi yerine, sorunlu ürün hiç gönderilmeyecek.

### B5. Performans
- Katalog büyüdükçe feed üretimi yavaşlayabilir — XML'i her istekte anlık üretmek yerine, arka planda (günde 1-2 kez, `server.js`'teki diğer periyodik görevlerle aynı desende) üretip diskte/DB'de cache'leyeceğim, endpoint sadece cache'lenmiş dosyayı sunacak.

### B6. Test/staging modu
- Feed'in canlıya alınmadan önce doğru göründüğünü kontrol edebilmen için `/idealo-feed.xml?preview=1` gibi bir önizleme modu ekleyeceğim (sadece ilk birkaç ürünü gösterir, hızlı kontrol için).

### B7. (Opsiyonel, ileride) Dönüşüm takibi
- İstersen, Idealo'dan gelen tıklamaları (`?idealo_click_id=...` gibi bir URL parametresi) checkout'ta yakalayıp, hangi Idealo tıklamasının gerçek siparişe dönüştüğünü bizim sellercentral raporlarımızda da görebiliriz. Bu faz 1'de gerekli değil, sonra eklenebilir.

---

## Önerilen sıra

1. **Sen:** A1 (hesap aç) → bu beklerken paralel olarak
2. **Ben:** B1, B2, B4, B5, B6'yı kodlarım (kategori eşleştirmesi hariç, o olmadan da feed iskeleti hazır olur)
3. **Sen:** Hesap onaylanınca A2 (kategori listesini iste, bana ilet)
4. **Ben:** B3'ü tamamlarım (kategori eşleştirme tablosu + ekranı)
5. **Sen:** A3 (feed URL'sini panele gir) → A4 (test/onay) → A5 (bütçe)
6. Canlı!

## Notlar / riskler
- Idealo hesabı onay süresi ve tam feed format detayları (bazı alanlar dönemsel değişebiliyor) hesap açılınca netleşecek — panelde veya onlarla yazışırken karşına çıkan resmi format dokümanını bana iletirsen, B2'deki eşleştirmeyi buna göre kesinleştiririm.
- Grundpreis (birim fiyat) zorunluluğu ürün kategorisine göre değişir — hangi ürünlerinizde bu gerekebileceğini test raporunda birlikte göreceğiz.
