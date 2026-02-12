# Sellercentral: Shopify Admin Benzeri Tasarım Referansı

Bu doküman, sellercentral arayüzünü **Shopify Admin** ile bire bir veya çok benzer yapmak isteyenler için referans ve iletişim rehberidir. Tasarımcıya veya geliştiriciye "Shopify dashboard gibi" demek yerine bu maddeleri gösterebilirsin.

---

## 1. Genel layout (sayfa iskeleti)

- **Tam ekran:** Sol sidebar + üst bar + ana içerik alanı; footer yok.
- **Sol sidebar (Navigation):**
  - Sabit genişlik (~240–260px), koyu arka plan (Shopify’da koyu gri / lacivert ton).
  - Logo veya uygulama adı en üstte.
  - Menü öğeleri: ikon + metin, dikey liste. Alt menüler ana menü altında girintili, ok/chevron ile açılır (veya sadece açılır, ok istemiyorsan kaldırılabilir).
  - En altta “Ayarlar” benzeri bir blok (Settings).
  - Mobilde sidebar overlay veya hamburger ile açılır.
- **Üst bar (TopBar):**
  - Sol: menü toggle (mobil), arama (isteğe bağlı).
  - Sağ: bildirim, profil/avatar, çıkış.
  - Beyaz/açık arka plan, ince alt border.
- **Ana içerik (Page):**
  - Beyaz/açık arka plan, soldan/sağdan padding.
  - Üstte sayfa başlığı (h1) + isteğe bağlı aksiyon butonları (örn. “Ürün ekle”).
  - İçerik: kartlar (Card), tablolar (DataTable), formlar, filtreler.

Referans: [Shopify Admin](https://admin.shopify.com) giriş yapıp herhangi bir sayfaya bak.

---

## 2. Renk ve tipografi

- **Sidebar:** Koyu arka plan (`#1a1a1a` – `#2d2d2d` aralığı), metin açık gri/beyaz.
- **Ana alan:** Açık arka plan (`#f6f6f7` veya `#fff`), metin koyu (`#202223`).
- **Vurgu:** Shopify yeşili veya marka rengi butonlarda/aktif durumda.
- **Yazı:** Sistem fontu veya Inter; başlıklar semibold (600), gövde metni normal (400). Polaris’te body için `font-size: 13px`, `line-height: 1.25` benzeri değerler kullanılır.

---

## 3. Bileşenler (Shopify Polaris karşılıkları)

| Görünüm / İşlev        | Shopify’da              | Uygulama notu                          |
|------------------------|-------------------------|----------------------------------------|
| Sayfa iskeleti         | `Frame` + `Page`        | Sol nav + üst bar + içerik alanı       |
| Sol menü               | `Navigation`            | İkon + label, alt menü girintili       |
| Üst çubuk              | `TopBar`                | Arama, bildirim, profil                |
| Sayfa başlığı + aksiyon| `Page` (title + primaryAction) | Başlık solda, buton sağda    |
| İçerik blokları        | `Card`                  | Başlıklı kutular, bölümler             |
| Tablolar               | `DataTable` / `IndexTable` | Sütun başlıkları, sıralama, aksiyon  |
| Butonlar               | `Button` (primary, secondary, plain) | Birincil yeşil/vurgu renk   |
| Form alanları          | `TextField`, `Select`, `Checkbox` | Label üstte, hata mesajı altta |
| Bildirimler            | `Banner`, `Toast`       | Başarı/hata/uyarı mesajları            |

Bu tabloyu “bire bir Shopify dashboard” derken hangi bileşenin nereye denk geldiğini anlatmak için kullanabilirsin.

---

## 4. Teknik seçenekler

### A) Shopify Polaris (React) – bire bir görünüm ✅ (Uygulandı)

- **Paket:** `@shopify/polaris` (React).
- **Artı:** Görünüm ve davranış Shopify admin ile neredeyse aynı (Frame, Navigation, Page, Card, DataTable vb.).
- **Eksi:** Polaris React resmen deprecated; lisans “Shopify yazılımı/hizmetleri ile entegre veya birlikte çalışan uygulamalar” için tanımlı. Kendi backend’inle (Medusa) kullanım lisansı gri alan; hukuki karar sana ait.
- **Projede:** Sellercentral `PolarisLayout.jsx` + `DashboardLayout.jsx` ile Polaris `AppProvider`, `Frame`, `Navigation`, `TopBar` kullanıyor. Menü öğeleri ve alt menüler Polaris Navigation.Section/item/subNavigationItems ile tanımlı.

### B) Polaris Web Components (yeni, framework-agnostic)

- Shopify’ın yeni önerisi; React dışı projelerde de kullanılabiliyor.
- Dokümantasyon: [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components).

### C) “Shopify tarzı” kendi implementasyonun

- Bu dokümandaki layout, renk ve bileşen listesini referans alıp mevcut stack’inle (styled-components, Tailwind, vs.) uygulamak.
- Lisans riski yok; görünüm “Shopify’a çok benzer” olur, bire bir değil.

### D) Hazır admin şablonları (referans veya temel)

- **Shadboard** (Next.js, shadcn/ui, Tailwind): [GitHub](https://github.com/Qualiora/shadboard) – sidebar + header layout; Shopify değil ama “admin dashboard” anlatımı için iyi referans.
- **Flowbite React Admin**, **Devias Kit**: Benzer şekilde sidebar + kart + tablo yapısı; Shopify renklerini ve tipografisini bu dokümana göre uyarlayabilirsin.

---

## 5. “Bire bir Shopify dashboard” demek istediğinde söyleyebileceğin cümleler

- “Layout: Sol tarafta sabit koyu sidebar (menü), üstte ince üst bar, geri kalan alan beyaz/açık gri içerik.”
- “Menü: Her satırda ikon + metin; alt menüler ana menü altında girintili ve daha açık renkte.”
- “İçerik sayfaları: Üstte büyük sayfa başlığı, sağda birincil aksiyon butonu; altta kartlar veya tablolar.”
- “Renk: Sidebar koyu (#202223 civarı), ana alan açık (#f6f6f7); butonlarda vurgu rengi (yeşil veya marka rengi).”
- “Referans: admin.shopify.com’daki sol menü ve sayfa düzeni.”

Bu dokümanı tasarım brief’i veya PR açıklaması olarak da kullanabilirsin (“Shopify admin layout’una göre güncellendi” gibi).
