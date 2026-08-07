# Support landing — Amazon Kundensupport hub

Durum: **6/6 adım tamamlandı** (2026-08-07)

## Adımlar

| Adım | Konu | Durum |
|------|------|--------|
| 1 | Mimari + veri modeli | ✅ `docs/SUPPORT-LANDING-STEP1-ARCHITECTURE.md` |
| 2 | Nesting (`children[]`, derinlik 3, editor ağaç) | ✅ |
| 3 | Yeni şablonlar (layout_section, order_picker, help_cards, help_library) | ✅ |
| 4 | Desktop CMS içerik + 6 dil + YAPTIM temizliği | ✅ seed `amazon_v1` → sonra v2 |
| 5 | Tablet + mobile padding/columns | ✅ layout `amazon_v2` |
| 6 | Smoke + seed kalıcılığı | ✅ test + smoke script + boot hook |

## Sayfa iskeleti (her `visible_on`)

1. `support_order_picker`
2. `support_help_cards`
3. `support_help_library`
4. `support_case_wizard` (`#support-wizard`)

Layout marker: `admin_hub_landing_pages.settings.support_landing_layout = "amazon_v2"`.

## Kalıcılık

- **Boot:** `server.js` → `ensureCustomerSupportLanding(client)` (best-effort)
- **CLI:** `npm run db:seed-customer-support` (`--force` / `--dry-run`)
- **Smoke (DB yok):** `npm run smoke:customer-support-landing`
- **Unit:** `npm run test:customer-support-landing`

Deploy sonrası backend restart layout’u `amazon_v2`’ye taşır; lokal `DATABASE_URL` ile `--force` de kullanılabilir.
