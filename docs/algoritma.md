# Pazaryeri ürün görünürlüğü ve sıralama algoritmaları

Bu doküman, ürünlerin kategori sayfaları, arama, carousel’ler ve özel menüler (Sales, Neuheiten, Bestsellers vb.) üzerindeki **görünürlük ve sıralamasının**, olumlu işaretlerle yukarı taşınması ve **yeni listelenen ürünlere makul bir “şans”** verilmesi mantığını açıklar. Hedef: **Amazon benzeri çok satıcılı** ortamda, kullanıcı memnuniyeti ve ticari performansı birlikte optimize eden, ölçülebilir ve yönetilebilir bir sistem.

---

## 1. Temel prensip: iki aşamalı sıralama

Büyük pazaryerlerinde pratik yaklaşım genelde şöyledir:

1. **Aday ürün havuzu (candidate generation)**  
   Filtreler, kategori, arama sorgusu, stok, bölge, yayındaki/onaylı kayıt vb. ile “bu sayfada gösterilebilecek” ürünler seçilir.

2. **Sıralama (ranking / re-ranking)**  
   Adaylar, bir **skor** veya çok amaçlı kurallarla sıralanır; gerekirse **çeşitlilik** (aynı satıcı / aynı marka dominasyonunu kırma) ile ikinci bir geçişte düzeltilir.

Sayfadaki görünürlük = **havuzda olmak** + **skorda üst sıralarda olmak**. Algoritma değişince yalnızca sıralama katmanı ve önbellekler güncellenir; ürün kartı bileşenleri sabit kalabilir.

---

## 2. “Amazon mantığı” için sinyal haritası

Aşağıdaki sinyaller, mümkün olduğunca **ölçülebilir** metriklerden türetilmelidir. Hepsi aynı anda devreye alınmak zorunda değildir; fazlı (MVP → gelişmiş) rollout önerilir.

### 2.1 Talep ve dönüşüm (popülerlik)

| Sinyal | Kaynak / yaklaşım | Not |
|--------|-------------------|-----|
| Satış adedi | Sipariş satırları, zaman penceresi (7 / 30 / 90 gün) | Kategoriye göre normalize edilebilir |
| Gelir (GMV) | Sipariş tutarı | Yüksek fiyatlı kategorilerde adet yerine denge |
| Görüntüleme / tıklama | Ürün listesi, PDP logları | CTR ve “add-to-cart” yakınlığı |
| Dönüşüm oranı | Sipariş / tıklama veya sepete ekleme | Düşük trafikli ürünlerde gürültülü; **Bayes düzeltmesi** veya minimum örneklem |

### 2.2 Fiyat ve teklif kalitesi (çok satıcı / aynı EAN)

Aynı global ürün (EAN) altında birden fazla satıcı teklifi varsa:

- **En düşük nihai fiyat** (kargo dahil mantığına uygun gösterim) güçlü pozitif sinyal.
- **Fiyat rekabeti**: kategori veya EAN grubu içinde fiyatın yüzdelik dilimi (ör. en ucuz %10).
- **İndirim derinliği**: kampanya / liste fiyatı tutarlılığı (kullanıcı güveni için şeffaflık).

Teklif seçimi: Bazen “Buy Box” benzeri **tek varsayılan satıcı** göstermek; bazen tüm teklifleri listelemek — ürün listesinde hangi model kullanılacaksa sıralama buna göre tanımlanmalıdır.

### 2.3 Müşteri memnuniyeti ve güven

| Sinyal | Kaynak | Kullanım |
|--------|--------|----------|
| Ürün puanı / yorum sayısı | PDP yorumları, Trustpilot vb. entegrasyon | Az yorumlu ürünlerde aşırı ceza vermemek için düzeltme |
| İade oranı | Sipariş / iade akışı | Yüksek iade cezası veya filtre eşiği |
| Şikayet / dispute | Destek, inbox | Satıcı veya ürün kalitesi bayrağı |
| Satıcı performansı | Kargoda gecikme, iptal, mesaj yanıt süresi | Hem sıralama hem “güven” rozeti |

### 2.4 Yerine getirme (fulfillment)

- **Teslimat süresi vaadi** (versandgruppe, bölge, stok konumu).
- **Stok durumu**: düşük stok “aciliyet” yaratırken, sürekli stoksuz kalan kayıtlar güveni düşürür.

### 2.5 İçerik ve politika uygunluğu

- Açıklama, görsel sayısı, zorunlu alanların doluluğu → **içerik kalite skoru**.
- Onay durumu, ihlal, marka kısıtları → **sert filtre** (listede hiç görünmeme).

Bu sinyaller ticari sonucu destekler; tamamen atlanırsa düşük kaliteli listeler üst sıralara çıkabilir.

---

## 3. Yeni ürüne “şans” verme (exploration)

Sadece geçmiş satışa göre sıralamak **Matthew etkisi** yaratır: eski satıcılar daha çok görünür, yeniler hiç öğrenilemez. Çözüm: **keşif / sömürü (exploration / exploitation)** karışımı.

### 3.1 Yaklaşımlar (basitten gelişmişe)

1. **Keşif bonusu (basit)**  
   Yayın tarihine göre azalan bir terim:
   - Örnek fikir: `exploration_boost = max(0, K * (1 - gün_since_publish / T))`  
   T ve K yapılandırılabilir; Neuheiten sayfasında T daha uzun tutulabilir.

2. **Garanti edilen minimum gösterim (slot)**  
   İlk N görüntüleme veya ilk X saat “boost kuşağı”; sonra bonus kademeli düşer.

3. **Thompson sampling / bantit (orta seviye)**  
   Her ürün için “başarı olasılığı” için dağılım tutulur; hem bilinen iyi ürünler seçilir hem de belirsiz olanlara örneklem verilir.

4. ** epsilon-greedy**  
   Küçük bir oranda (ör. %5–15) sıralama rastgele veya sadece tazelik ile karıştırılır; loglanarak hangi politikanın gelir getirdiği ölçülür.

### 3.2 Adalet kuralları

- Keşif bonusu **kategori başına tavan** ile sınırlanmalı; aksi halde bir kategori tek tip “yeni ama kötü” ürünle dolar.
- **Spam yeni ürün** (kopya liste, düşük içerik) için içerik skoru veya manuel onay eşiği şart olabilir.
- Aynı EAN altında **çok teklif** varsa, keşif bazen **satıcı düzeyinde** uygulanır (yeni satıcıya şans).

---

## 4. Birleşik skor: pratik formül düşüncesi

Tek bir sayı üretmek işleri basitleştirir; parametreler yapılandırma ile ayarlanır.

### 4.1 Çarpımsal (log-lineer) model — yorumlanması kolay

Her sinyal uygun ölçekte normalize edilip log alınarak çarpılır; böyük uçlar daha az patlar:

\[
\log S = \sum_i w_i \cdot f_i(\text{sinyal}_i) + \text{exploration\_bonus}
\]

- \(f_i\): örn. min–max scale, yüzdelik dilim, log1p(satış).
- \(w_i\): ağırlık — başlangıçta iş tahmini, sonra A/B veya offline simülasyonla iterasyon.

### 4.2 Katmanlı (tiered) model — iş kuralları net

1. Sert filtreler (stok yok, onay yok, bölge dışı).  
2. Taban skor: popülerlik + fiyat rekabeti + memnuniyet.  
3. İnce ayar: teslimat, içerik kalitesi.  
4. Ceza: yüksek iade, düşük satıcı skoru.  
5. Keşif bonusu ekle → final sıra.

Bu model ürün sahiplerine ve desteğe “neden düştü?” sorusunu açıklamayı kolaylaştırır.

### 4.3 Çeşitlilik (diversity) ve satıcı tavanı

İlk skordan sonra ikinci geçiş:

- Ardışık pozisyonlarda aynı **satıcı** veya aynı **marka** üst üste gelmesin (maksimum \(k\) ardışıklık).
- Veya ilk sayfada bir satıcıdan en fazla \(m\) ürün.
- “Best seller” rozeti tek EAN’da bir teklife veriliyorsa, rozet skora sabit ek veya ayrı kural olabilir.

---

## 5. Sayfa türlerine göre davranış

TALIMAT’taki özel menüler için önerilen strateji özeti:

| Sayfa / bağlam | Aday havuzu | Sıralama odağı |
|----------------|-------------|----------------|
| **Sales** | İndirimli / kampanyalı ürünler | İndirim + dönüşüm + güven; keşif düşük–orta |
| **Neuheiten** | Son X günde yayınlanan | Önce tazelik, sonra talep sinyalleri; keşif yüksek |
| **Bestsellers** | Kategori bazlı | Satış/GMV ağırlığı yüksek; keşif düşük |
| **Kategori listesi** | Kategori + alt kategori | Genel sıralama + çeşitlilik |
| **Arama** | Full-text | Önce **alaka (relevance)**, sonra ticari re-ranking |
| **Benzer ürünler / öneri** | Embedding veya eş kategori | Kişiselleştirme + popülerlik |

Her bağlam aynı kod yolunu **`strategy` veya `context` parametresi** ile seçmeli; böylece Sales ile Bestsellers farklı ağırlıklar kullanır.

---

## 6. Ek olarak düşünülmesi gereken algoritmalar

Aşağıdakiler “görünürlük” dışında platform sağlığı için kritiktir:

| Alan | Açıklama |
|------|----------|
| **Arama alaka skoru** | Token eşleşmesi, eş anlamlı, typo tolerance, faceted filtre uyumu |
| **Sorgu önerisi / otomatik tamamlama** | Popüler sorgular + kişisel geçmiş |
| **Fraud / risk skoru** | Şüpheli sipariş, ödeme, hesap davranışı |
| **Fiyat bütünlüğü** | Anormal fiyat, yanlış varyant fiyatı tespiti |
| **Stok tahmini** | Satıcıya yeniden stok uyarısı; vitrinde “az kaldı” politikası |
| **Kampanya uygunluk motoru** | Hangi ürün hangi indirim kuralına girer |
| **Bildirim / e-posta tetikleri** | Sepette kaldı, fiyat düştü, geri stokta |
| **Satıcı adillik panosu** | Görünürlük indeksi, dönüşüm hunisi — destek ve satıcı güveni |

Bunların bir kısmı sıralamayı dolaylı etkiler (ör. fraud → iptal → kötü sinyal).

---

## 7. Sistemi kurma: mimari ve veri akışı

### 7.1 Olay toplama (event logging)

Minimum olay seti:

- `list_impression` (hangi sayfa, sıra, strategy, ürün id, satıcı/teklif id)
- `product_click`
- `add_to_cart`, `purchase`
- Arama: `search_query`, `result_click_position`

Olaylar kullanıcı oturumu veya anonim id ile birleştirilebilir; KVKK / çerez politikasına uygun tutulmalıdır.

### 7.2 Özellik hesaplama (feature computation)

- **Batch (ör. saatlik / günlük)**: satış toplamları, iade oranları, satıcı metrikleri, “bestseller” rozet adayları.
- **Streaming (isteğe bağlı)**: son 1 saat trend; daha zor ama güçlü.

Sonuçlar:

- Veritabanında **özet tablolar** veya
- **Redis** gibi önbellekte “product_id → rank features” anahtarları

### 7.3 Sıralama servisi (API)

Öneri: backend’de tek bir soyutlama:

- Girdi: `context`, `category_id`, `filters`, `locale`, `buyer_region`, `page`, `limit`
- İşlem: aday çekme → özellik birleştirme → skor → çeşitlilik → sayfalama
- Çıktı: sıralı ürün id listesi + debug (isteğe bağlı `score_breakdown` yalnızca admin)

Shop ve Seller Central yalnız bu API’ye güvenir; formül değişince frontend yeniden deploy gerekmeyebilir.

### 7.4 Yapılandırma ve deney

- **Parametre deposu**: ağırlıklar, keşif oranı, zaman pencereleri (JSON veya DB tablosu).
- **Feature flag**: yeni politika yüzde trafiğe açılır.
- **A/B metrikleri**: CTR, add-to-cart rate, satış, GMV, iade oranı, sayfa başına gelir.

### 7.5 Gözlemlenebilirlik

Her listeleme yanıtında (sunucu logu):

- `ranking_version` veya `strategy_id`
- Örneklem olarak ilk 20 ürünün skor parçaları

Böylece “Bu ürün neden 40. sırada?” sorusu veri ile cevaplanır.

---

## 8. Uygulama yol haritası (fazlar)

**Faz 0 — Ölçüm**  
Impression / tıklama / satır siparişi logları ve temel pano.

**Faz 1 — Deterministik sıralama**  
Satış + tazelik + stok + onay; Neuheiten için sert tarih kuralı; Sales için indirim bayrağı.

**Faz 2 — Çok sinyalli skor**  
Fiyat yüzdeliği, satıcı skoru, içerik skoru; keşif bonusu (basit formül).

**Faz 3 — Çeşitlilik ve gelişmiş keşif**  
Satıcı tavanı, bantit / epsilon; arama için relevance + re-rank.

**Faz 4 — Kişiselleştirme**  
Oturum veya kullanıcı vektörü; benzer ürün grafiği.

Her fazda eski politika yedekte kalmalı (geri alma).

---

## 9. Özet

- **Görünürlük**, filtre + **dinamik sıralama** ile yönetilir; Amazon-benzeri davranış için **fiyat, müşteri memnuniyeti, yerine getirme ve talep** birlikte modele girmelidir.
- **Yeni ürünlere şans**, saf satış sıralamasına **keşif bonusu** veya **bantit** ile eklenmeli; aksi halde katalog donuklaşır.
- Sistem **event → özellik → skor → (isteğe bağlı) çeşitlilik** hattıyla kurulduğunda, TALIMAT’taki Sales / Neuheiten / Bestsellers sayfaları aynı altyapıyı farklı `strategy` ile kullanır; parametreler deney ile iterasyonla iyileştirilir.

Bu doküman canlı bir “ürün spesifikasyonu” olarak ele alınmalı; ağırlıklar ve eşikler iş hedefi ve veri hacmine göre birlikte ayarlanır.
