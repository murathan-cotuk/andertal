# Adım 1 — Support landing: nesting mimarisi + veri modeli

Durum: **TAMAMLANDI** (mimari) — uygulama Adım 2–6 ile bitti; özet: `docs/SUPPORT-LANDING-STATUS.md`  
Sonraki: yok (epic kapandı). Kullanıcı “devam” demeden ek iş yok.

---

## 1. Problem

Amazon Contact Hub üç katmanlı bir layout kullanıyor:

1. Sipariş seçici (başlık + grid kartlar + CTA’lar)
2. Yardım kartları grid (“Fragen zu Einkäufen?”)
3. Yardım kütüphanesi (arama + konular + makale listesi)

Bazı bloklar **iç içe**: dış section (başlık/açıklama/padding) + iç grid/kartlar.  
Bugün Andertal landing container’ları **düz dizi** — `children` yok.

---

## 2. Kararlar (kilitli)

### 2.1 Nesting modeli: `children[]`

Her container (isteğe bağlı) şunu taşıyabilir:

```js
children: [ /* aynı container şeması, recursive */ ]
```

- Maks. derinlik: **3** (root → child → grandchild). Daha derin reject.
- Root dizisi + tüm `children` toplamı (flatten count) ≤ **200** (mevcut cap).
- `children` yoksa / `[]` ise davranış bugünküyle birebir aynı (geriye uyumlu).

### 2.2 Kimler children kabul eder?

| Tip | Children? | Not |
|-----|-----------|-----|
| `layout_section` (**yeni**) | Evet — asıl “kutu içinde kutu” host | Amazon section sarmalayıcı |
| Tüm mevcut tipler | Evet (opsiyonel) | Altında ek blok / CTA strip |
| `support_order_picker` | Hayır (kendi `orders_ui` / CTA alanları) | Semantik tip |
| `support_help_cards` | Hayır (`cards[]` item dizisi) | Semantik tip |
| `support_help_library` | Hayır (`topics[]` / `articles[]`) | Semantik tip |

**Pratik kural:** Layout nesting → `layout_section` + children.  
Domain UI → yeni support şablonlarının kendi item alanları (kart/topic), children değil.

Mevcut tiplere children eklemek yine de serbest (ör. `text_block` altında küçük CTA grid); editor’da “Alt container ekle” her tipte görünür, depth limiti aşılırsa disabled.

### 2.3 Cihaz (`visible_on`)

- **Root container** `visible_on`: desktop | tablet | mobile (mevcut model; 3 kopya).
- **Child** varsayılan: parent ile aynı viewport’ta render (ayrı `visible_on` yok / ignore).
- İleride gerekirse child’da override açılabilir; Adım 2’de **ignore child visible_on** (basit).

### 2.4 i18n (`_i18n`)

Mevcut kural aynen:

- DE → root alanlar
- en/tr/fr/es/it → `_i18n[locale]`
- `_i18n.de` yasak (support sanitize ile uyumlu)

Children kendi `_i18n`’ine sahip olabilir.

### 2.5 Editor UX (Adım 2’de kodlanacak)

- Sol liste: flat değil, **ağaç** (indent + depth badge).
- Seçili container’da: “Alt container ekle” → tip dropdown (depth &lt; 3).
- Sürükle-bırak: önce aynı seviyede reorder; cross-parent move Adım 2 MVP’de opsiyonel (yukarı/aşağı + “ebeveyne taşı” yeterli olabilir).
- Preview: recursive render.

### 2.6 Shop render (Adım 2)

```text
renderContainer(c):
  inner = typeSwitch(c)
  kids = (c.children || []).map(renderContainer)
  return <>{inner}{kids}</>   // layout_section: kids içeride grid/slot’ta
```

`layout_section`: başlık/açıklama/padding/bg + **iç slot**’ta children (CSS grid: `columns`, `gap`).

### 2.7 Backend sanitize (Adım 2)

- Recursive walk; depth &gt; 3 → 400
- `cleanObject` her düğümde
- Support tipleri: mevcut `sanitizeSupportContainer` + yeni tipler için whitelist
- `layout_section` + yeni support tipleri: sıkı alan listesi

---

## 3. Yeni container tipleri (Adım 3’te dropdown’a)

### 3.1 `layout_section`

```js
{
  id, type: "layout_section", visible: true, visible_on: "desktop",
  title: "", description: "",
  bg_color: "#ffffff", text_color: "#111827",
  padding: "48px 24px",
  content_layout: "contained", content_max_width: "1200px",
  columns: 1,          // children grid columns (1–4)
  gap: 16,
  children: [],
  _i18n: { en: { title, description }, … }
}
```

Amazon’daki “Haben Sie Fragen…?” dış sarmalayıcı buna oturur; içine `support_help_cards` **veya** children olarak kart container’ları.

**Tercih (Adım 4 içerik):** tek `support_help_cards` (kendi grid’i) + üstte `layout_section` sadece gerektiğinde. Gereksiz nesting yok.

### 3.2 `support_order_picker`

```js
{
  id, type: "support_order_picker", visible_on: "desktop",
  title: "Brauchst du Hilfe bei einem aktuellen Artikel, {first_name}?",
  subtitle: "Wähle unten den Artikel…",
  guest_title: "Brauchst du Hilfe?",          // login yoksa
  empty_orders_text: "Noch keine Bestellungen",
  orders_limit: 6,
  orders_columns_desktop: 3,
  orders_columns_tablet: 2,
  orders_columns_mobile: 1,
  cta_other_item_label: "Hilfe bei einem anderen Artikel",
  cta_other_item_url: "/orders",
  cta_other_problem_label: "Hilfe bei einem anderen Problem",
  cta_other_problem_url: "#support-wizard",
  // runtime: shop müşteri sipariş API’sinden doldurur (CMS’te sipariş listesi yok)
  _i18n: { … }
}
```

### 3.3 `support_help_cards`

```js
{
  id, type: "support_help_cards",
  title: "Haben Sie Fragen zu Ihren Einkäufen?",
  view_all_label: "Alles ansehen",
  view_all_url: "/orders",
  columns_desktop: 2, columns_tablet: 2, columns_mobile: 1,
  cards: [
    {
      id, icon: "📦", title: "Wo ist meine Bestellung?",
      description: "Verfolge Pakete…",
      url: "/orders", order: 0,
      _i18n: { en: { title, description }, … }
    },
    // …
  ],
  _i18n: { … }
}
```

### 3.4 `support_help_library`

```js
{
  id, type: "support_help_library",
  title: "Durchsuche unsere Hilfe-Bibliothek",
  search_placeholder: "Gib etwas ein, wie z. B. „Frage zu einer Gebühr.“",
  all_topics_label: "Alle Hilfethemen",
  recommended_heading: "Empfohlene Themen",
  topics: [
    { id, title: "Wo ist meine Bestellung?", url: "…", order: 0, _i18n },
    // …
  ],
  more_heading: "Weitere Themen & Hilfeseiten",
  articles: [
    { id, title, body_or_excerpt, url, order, _i18n },
    // …
  ],
  footer_title: "Brauchst du weitere Hilfe?",
  footer_body: "",
  footer_cta_label: "Neue Support-Anfrage",
  footer_cta_url: "#support-wizard",
  _i18n: { … }
}
```

Mevcut `support_faq` / `support_topic_grid` / `support_case_wizard` / `support_hero` **silinmez**; Adım 4’te yeni sayfa düzeni bunları kısmen kullanmaya devam edebilir (wizard alta kalır).

---

## 4. Sayfa iskeleti (Adım 4–5 içerik — şimdilik tasarım)

Her `visible_on` için aynı sıra (padding/columns cihaza göre değişir):

1. `support_order_picker`
2. `support_help_cards` (Amazon “Fragen zu Einkäufen”)
3. `support_help_library`
4. `support_case_wizard` (mevcut — ticket açma; `#support-wizard`)
5. İsteğe bağlı `support_faq` veya library articles yeterliyse çıkarılır

“YAPTIM OLDU” test `text_block`’ları Adım 4’te silinir.

Diller: DE root + en, tr, fr, es, it.

---

## 5. Dosya dokunuş haritası (sonraki adımlar)

| Katman | Dosya |
|--------|--------|
| Tipler + seed copy | `sellercentral/.../landing-page-editor-i18n.js` |
| newContainer + editor + ağaç UI | `LandingPageEditor.jsx` |
| Shop render | `LandingContainers.jsx` + `SupportLanding.jsx` (+ CSS) |
| Sanitize | `medusa-backend/.../pages.js` |
| CMS içerik | API/script → `admin_hub_landing_pages` page `customer-support` |
| Opsiyonel seed | `customer-support-landing-seed.js` |

---

## 6. Bilinçli MVP sınırları

- Child `visible_on` yok (parent cihaz kopyası yeter).
- Cross-tree drag-drop zorunlu değil.
- Sipariş kartları **canlı API**; CMS’te mock ürün yok.
- Nesting derinliği 3.
- Amazon Prime / Music / Video maddeleri Andertal’a uyarlanır (üyelik yoksa ilgili kartlar “Bonus / Konto / Gizlilik” vb.).

---

## Adım 1 çıktısı

Bu doküman = onaylı mimari. Kod yazılmadı.

**Onay için:** “devam” → Adım 2 (nesting altyapısı implementasyonu).
