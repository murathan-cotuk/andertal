# JTL ortaklık + entegrasyon — Claude talimatı ve task listesi

**Kaynak sözleşme:** `docs/JTL/JTL Contract.pdf` (üç parça: NDA + Marktplatzpartnervertrag + API License).  
**İlgili teknik plan:** `docs/CONNECTOR.md` (SCX connector — bu dosyayı kopyalama, ona bağlan).  
**Kurallar:** `CLAUDE.md`. Commit / push / prod backfill yalnız kullanıcı isterse. Para hesabı satıcı komisyonundan (%12+KDV) **ayrı** tutulur.

**Claude kickoff:** Bu dosyayı oku. Aşağıdaki fazları sırayla uygula. Satıcı payout / Stripe Connect / mevcut commission_vat mantığını bozma.

---

## 0. Sözleşme — ne yapmak zorundayız (özet)

| Yükümlülük | Kim | Ne |
|------------|-----|-----|
| Partner dizini / Store / duyuru | JTL | Onlar yapar |
| JTL satıcılarının Andertal’da satması | Andertal | SCX connector + signup |
| **%1 Provision** | Andertal → JTL | JTL ortaklığıyla **ilk kez** Andertal müşterisi olan veya **son 12 ayda işlem yapmamışken dönen** JTL-Nutzer (satıcı) için; **brüt ciro** (mal + kargo + diğer, üçüncü kişilere satış) × %1 + USt (fatura JTL’den) |
| **Çeyreklik reporting** | Andertal | Her çeyrek bitince, takip eden ayın **5’ine** kadar `technologiepartner@jtl-software.de`; aylık döküm + doğruluk beyanı |
| Ödeme | Andertal | JTL faturasından **2 hafta** sonra |
| API | Andertal | Key gizli, rate limit, KVK (üçüncü taraf kişisel veri ≤30 gün, şifreli) |
| NDA | İki taraf | Ticari sır |

**Önemli:** Bu %1, satıcıdan kestirdiğimiz platform komisyonu değildir. Platform geliri üzerinden JTL’ye ödenen **partner ücreti**dir.

**İmzalar (Contract.pdf):** Murathan Cotuk – Andertal (Kaarst) ↔ JTL-Software-GmbH (Hückelhoven); DocuSign.

---

## 1. Faz A — Attribution (kim “JTL satıcısı”?)

### A1. Veri modeli
- Satıcı / listing tarafında kalıcı işaret:
  - `seller_users` veya `admin_hub_jtl_sellers` (CONNECTOR.md): `jtl_attributed = true`
  - `jtl_first_attributed_at` (timestamp)
  - `jtl_seller_external_id` / SCX seller id
  - `attribution_source = 'jtl_scx_signup' | 'manual_superuser'`
- **12 ay kuralı:** Son 12 ayda Andertal’da satış yokken JTL üzerinden tekrar bağlanırsa yeniden provisionspflichtig (sözleşme 3.1). Attribution geçmişi ve “son satış tarihi” ile hesapla; birim test yaz.
- Şema: mevcut `ensure` / `ADD COLUMN IF NOT EXISTS` deseni (klasik migration yok).

### A2. Attribution noktaları
- SCX signup complete (`jtl-scx-signup` / CONNECTOR flow) → otomatik attribute.
- Superuser manuel işaret (billing JTL tab veya seller detay) — audit log.
- Billbee / organik kayıt → JTL %1’e **girmez**.

### A3. Test
- Yeni JTL signup → attributed.
- 12 ay + satış yok + yeniden bağlan → yeniden eligible.
- 6 ay önce satış var → eligible değil (sözleşme: “wiederkehrt, sofern er in den letzten 12 Monaten keine Geschäfte …”).

---

## 2. Faz B — Brüt GMV ve %1 accrual

### B1. Hesap
Her eligible satıcı + dönem için:
- `gross_gmv_cents` = Andertal’da üçüncü kişilere satış (satır brüt + ilgili kargo; kupon/bonus platform finansmanı kuralları BonusPunkte / settlement ile uyumlu — JTL’ye “Warenkorb inkl. Versand” brütü).
- `jtl_provision_net_cents = round(gross_gmv_cents * 0.01)`
- USt: JTL faturasına göre (genelde DE %19); Andertal tarafında **borç kaydı** net+USt veya “bekleyen fatura” olarak tutulabilir. İlk sürüm: net %1 snapshot + “USt JTL faturasında” notu; mümkünse `PLATFORM_VAT` ile tahmini USt ayrı kolon.

### B2. Ledger / tablo
Yeni tablo önerisi (ensure deseni):
```
jtl_partner_accruals (
  id, period_yyyy_qn, seller_id, order_id?, order_item_id?,
  gross_cents, provision_cents, currency,
  attribution_id, created_at, reporting_batch_id nullable
)
```
veya dönem özeti + satır detayı. Mevcut `seller_ledger` satıcı hakedişine **karışmasın** — ayrı domain.

### B3. Ne zaman yazılır?
- Sipariş `paid` / settlement payable oluşunca (eligible seller ise) accrual satırı.
- İade/chargeback: orantılı negative accrual (sözleşme iade detayı yok; Andertal settlement refund oranıyla tutarlı ol — dokümante et).

### B4. Test
100 € GMV → 1 € provision; kısmi iade → orantılı düşüş.

---

## 3. Faz C — SellerCentral Settings → Billing → **JTL** tab (superuser)

**Dosya:** `apps/sellercentral/src/components/pages/settings/BillingSettingsPage.jsx`  
Mevcut: Tabs → … → `FinanzamtTab` (superuser).  
**Ekle:** Superuser-only tab `JTL` (Finanzamt yanında).

### C1. UI içerik
1. **Özet KPI:** Bu çeyrek GMV (JTL-attributed), %1 provision, satıcı sayısı, son rapor tarihi / durumu.
2. **Bağlı satıcılar listesi:** JTL entegre + attributed; son satış, dönem GMV, provision.
3. **Dönem seçici:** Q1–Q4 / yıl (Finanzamt period UX’ine benzer).
4. **Rapor önizleme:** Sözleşmenin istediği minimum:
   - (i) Provisionsrelevante Vorgänge **aylara** bölünmüş
   - (ii) Vollständigkeit/Richtigkeit beyanı (UI’da checkbox + audit)
5. **Export:** CSV + XLSX (ve isteğe PDF özet).
6. **Manuel “Raporu JTL’ye gönder”** butonu (e-posta flow tetikler).
7. **Ayarlar (küçük):** `jtl_reporting_email` default `technologiepartner@jtl-software.de` (env veya platform settings); CC superuser opsiyonel.

### C2. API
- `GET /admin-hub/v1/billing/jtl?period=2026-Q1` — özet + satıcılar
- `GET /admin-hub/v1/billing/jtl/export?period=…&format=csv|xlsx`
- `POST /admin-hub/v1/billing/jtl/send-report` — body: period, confirm_accuracy: true  
  Superuser only. Mirror: `/api/billing/jtl-*` BFF like finanzamt-export.

### C3. i18n
6 dil tab label + boş state (de/en/tr/fr/it/es), mevcut `lt()` deseni.

---

## 4. Faz D — Otomatik e-posta (JTL reporting flow)

### D1. Zamanlama (sözleşme)
Çeyrek sonu → **sonraki ayın 5’i** (veya 5’inden önce):
- Q1 (Oca–Mar) → rapor **5 Nisan**’a kadar
- Q2 → 5 Temmuz
- Q3 → 5 Ekim
- Q4 → 5 Ocak

### D2. Uygulama seçenekleri (tercih sırası)
1. **Mevcut** `admin_hub_flows` + BullMQ/`flow-queue` cron job: trigger `jtl_partner_quarterly_report`.
2. Yoksa: `node-cron` / worker job `jtl.reporting.quarterly` (CONNECTOR queue deseni).

Flow içeriği:
- Alıcı: `technologiepartner@jtl-software.de` (+ ayarlanabilir)
- Konu: `Andertal JTL Partner Reporting {YYYY}-Q{n}`
- Gövde: dönem, toplam GMV, %1, satıcı sayısı, “Angaben vollständig und richtig” metni
- Ek: CSV/XLSX attachment (aynı export)
- Log: `jtl_report_sends` (period, sent_at, message_id, status)

### D3. Manuel + otomatik
- Otomatik: ayın 4’ü veya 5’i sabah (TZ Europe/Berlin) — süperuser’a da kopya.
- Manuel: Billing → JTL → “Send report”.
- Dry-run / “sadece bana gönder” superuser testi.

### D4. Content → Flows
Mümkünse Flow editöründe şablon görünsün; yoksa kod şablonu + ayar yeterli. Dokümante et.

---

## 5. Faz E — SCX Connector (teknik entegrasyon)

**Bu fazın detayı:** `docs/CONNECTOR.md` — yeniden yazma.  
JTL.md açısından minimum “ortaklık için hazır” checklist:

- [ ] Env: `JTL_SCX_*`
- [ ] Signup/update URL’leri Partner Portal’da
- [ ] Seller bağlanınca attribution (Faz A)
- [ ] Ürün/stok/sipariş sync (CONNECTOR task list)
- [ ] ASLA JTL DB direct

Connector olmadan da manuel attributed satıcılar için reporting çalışabilmeli (superuser işaret).

---

## 6. Faz F — Operasyon / hukuki dokümantasyon

- `docs/jtl.md` (bu dosya) güncel kalsın.
- Provisionsrechnung / satıcı PDF’lerine JTL %1 **karışmaz**.
- NDA: loglarda JTL sırlarını gereksiz dump etme.
- Fesih: JTL bağlantısını kapatma (CONNECTOR disconnect) — partner sözleşme §4.5.

---

## 7. Sıralı task listesi (Claude checkbox)

### Veri & muhasebe
- [x] A1 Attribution şema (ensure / ADD COLUMN)
- [x] A2 Signup + manuel attribute
- [x] A3 Attribution unit test (12 ay kuralı)
- [x] B1 GMV tanımı (kod + yorum; settlement ile uyum)
- [x] B2 `jtl_partner_accruals` (veya eşdeğer) + yazma noktası
- [x] B3 İade/chargeback reversal
- [x] B4 Unit/integration test %1

### Billing UI
- [x] C1 BillingSettingsPage’e superuser **JTL** tab
- [x] C2 KPI + satıcı listesi + dönem
- [x] C3 Export CSV/XLSX
- [x] C4 API endpoints + BFF
- [x] C5 i18n 6 dil

### E-posta
- [x] D1 Quarterly schedule (Berlin TZ, ayın 5’i kuralı)
- [x] D2 Send + attachment + log tablosu
- [x] D3 Manuel gönder + test modu
- [x] D4 Flow/cron kaydı Content→Flows veya worker

### Connector (paralel, CONNECTOR.md)
- [ ] E0 Token/env + signup URL
- [ ] E1 SCX auth + poller
- [ ] E2 Signup → attribution hook
- [ ] E3 Product/order sync (CONNECTOR fazları)

### Doğrulama
- [x] Eligible satıcı 100 € → accrual 1 €
- [x] Non-JTL satıcı → rapor dışı
- [x] Export sütunları: ay, seller_id, gross, provision, beyan
- [x] Superuser olmayan JTL tab’i görmez
- [x] E-posta dry-run başarılı
- [x] Mevcut Finanzamt / satıcı komisyon testleri yeşil

---

## 8. Bilinçli dışı bırakılanlar

- JTL’nin Andertal’a ödeme yapması (yok; biz öderiz).
- Satıcı komisyon oranını %1 yapmak (yanlış).
- Uydurma `/jtl` marketing sayfası (CLAUDE.md / SEO kuralı — gerçek metin yoksa açma).
- Prod’a kör INSERT; staging yok.

---

## 9. Rapor minimum şema (export)

| Kolon | Açıklama |
|-------|----------|
| period | 2026-Q1 |
| month | 2026-01 |
| seller_id | Andertal id |
| jtl_external_id | varsa |
| seller_name | |
| gross_gmv_cents | brüt |
| provision_1pct_cents | %1 |
| currency | EUR |
| order_count | |
| accuracy_declaration | true + timestamp (batch) |

Özet satır: dönem toplamları.

---

## 9b. Uygulama durumu (2026-10-07, Faz A–D)

- Kod: `apps/medusa-backend/src/jtl-partner/index.js` (domain), `src/routes/jtl-partner.js` (API, superuser), `server.js` (şema + 6 saatte bir otomatik rapor kontrolü), `src/email.js` (opsiyonel `cc` / `attachments`). SC: `components/pages/settings/JtlPartnerTab.jsx` (Billing → JTL), BFF `app/api/billing/jtl-export/route.js` (XLSX).
- Satıcı ledger'ına / payable'lara / Provisionsrechnung'a **hiçbir şey yazılmaz**; accrual'lar settlement tablolarından idempotent senkronla (`syncJtlAccruals`) üretilir.
- A2 notu: manuel işaretleme hazır. SCX sign-up (Faz E, CONNECTOR.md) yazıldığında signup tamamlanınca şu çağrılacak: `attributeJtlSeller(client, { sellerId, source: 'jtl_scx_signup', externalId: <SCX seller id> })`; bağlantı kesilince `endJtlAttribution`.
- Kararlar: baz = satıcı payable brüt (mal + kargo, KDV dahil); iadeler başarılı iade satırıyla orantılı düşer; chargeback düşülmez (sözleşmede yok — netleştirilecek); USt tahmini %19, fatura JTL'den.
- D4: Flow editörü yerine kod job'u (`autoSendDueJtlReport`): her çeyrek sonrası ayın 4–5'i (Europe/Berlin), daha önce gönderilmemişse gönderir; JTL_REPORT_CC'ye kopya.
- Testler: `node --test src/jtl-partner/jtl-partner.test.js` (PG gerektirenler `SETTLEMENT_TEST_PG_URL` ile; `npm run test:settlement` içinde).

**Env kontrol listesi**
| Değişken | Varsayılan | Not |
|---|---|---|
| `JTL_REPORTING_EMAIL` | `technologiepartner@jtl-software.de` | §3.3 alıcı |
| `JTL_REPORT_AUTO_SEND` | kapalı | `true` = ayın 4–5'i otomatik gönderim (yalnız prod'da aç) |
| `JTL_REPORT_CC` | — | superuser kopya adresi |
| `RESEND_API_KEY` / `SMTP_*` | mevcut | e-posta sağlayıcı (yoksa gönderim yalnız loglanır) |
| `JTL_SCX_*` | — | Faz E (CONNECTOR.md) |

## 10. Claude’a son emir

1. Bu dosyayı ve `docs/CONNECTOR.md` + `docs/JTL/JTL Contract.pdf` (Marktplatzpartnervertrag §3–4) oku.  
2. Faz A → B → C → D sırası; E CONNECTOR ile paralel.  
3. `BillingSettingsPage.jsx` Finanzamt yanına JTL tab.  
4. Para: satıcı ledger’ına JTL %1 yazma.  
5. Bitince: kısa özet + test komutları + env checklist.
