-- Stripe ile ilişkili tüm referansları veritabanında sıfırlar (Andertal bridge şeması).
-- Ürün kayıtlarında Stripe ürün/fiyat ID kolonu yoktur; yalnızca aşağıdaki tablolar güncellenir.
--
-- UYARI:
-- - Geçmiş siparişlerdeki payment_intent_id (pi_...) silinir; Stripe üzerinden siparişe bağlantı kaybolur.
-- - stripe_transfer_* alanları sıfırlanır.
-- - Satıcıların Connect hesap bağlantısı (stripe_account_id) kalkar; onboarding yenilenmelidir.
-- - store_platform_checkout içindeki PK/SK silinir; Sellercentral'dan yeni anahtarlar girilmelidir.

BEGIN;

UPDATE store_customers
SET stripe_customer_id = NULL;

UPDATE store_orders
SET
  payment_intent_id = NULL,
  stripe_transfer_status = 'legacy_skipped',
  stripe_transfer_id = NULL,
  stripe_transfer_error = NULL,
  stripe_transfer_at = NULL,
  updated_at = now();

UPDATE seller_users
SET
  stripe_account_id = NULL,
  stripe_onboarding_complete = false,
  updated_at = now();

UPDATE seller_campaigns
SET stripe_charge_id = NULL;

UPDATE store_platform_checkout
SET
  stripe_publishable_key = NULL,
  stripe_secret_key = NULL,
  updated_at = now()
WHERE id = 1;

COMMIT;
