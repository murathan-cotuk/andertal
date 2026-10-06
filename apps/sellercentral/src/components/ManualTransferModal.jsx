"use client";

import React, { useEffect, useState } from "react";
import { Banner, BlockStack, Button, InlineStack, Spinner, Text, TextField } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getPaymentsCopy } from "@/lib/payments-i18n";
import { fmtMoney } from "@/lib/locale-text";

/**
 * Superuser records a bank transfer made OUTSIDE Stripe. The amount shown is what the backend
 * settlement would book right now (all claimable ledger entries); the backend rejects anything
 * that does not match it exactly and requires the real bank reference (audit-logged).
 */
export default function ManualTransferModal({ seller, onClose, onDone }) {
  const locale = useLocale();
  const txt = getPaymentsCopy(locale);
  const [amount, setAmount] = useState(null);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getMedusaAdminClient().getSettlementSummary(seller.seller_id)
      .then((r) => { if (alive) setAmount(Number(r?.claimable_cents || 0)); })
      .catch((e) => { if (alive) { setError(e?.message || txt.genericError); setAmount(0); } });
    return () => { alive = false; };
  }, [seller.seller_id, txt.genericError]);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await getMedusaAdminClient().markPayoutPaid({
        seller_id: seller.seller_id,
        transfer_reference: reference.trim(),
        confirm_amount_cents: amount,
      });
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || txt.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, padding: 20 }}>
        <BlockStack gap="300">
          <Text variant="headingMd">{txt.manualPayTitle} — {seller.store_name || seller.email || seller.seller_id}</Text>
          <Text variant="bodySm" tone="subdued">{txt.manualPayAmount}</Text>
          {amount == null ? <Spinner size="small" /> : <Text variant="headingLg">{fmtMoney(amount, locale)}</Text>}
          {amount != null && amount <= 0 && <Banner tone="info">{txt.manualPayNothing}</Banner>}
          {amount > 0 && (
            <>
              <TextField label={txt.manualPayReference} value={reference} autoComplete="off" onChange={(v) => { setReference(v); setError(""); }} />
              <Text variant="bodySm" tone="subdued">{txt.manualPayHint}</Text>
            </>
          )}
          {error && <Banner tone="critical">{error}</Banner>}
          <InlineStack gap="200" align="end">
            <Button onClick={onClose}>{txt.cancel}</Button>
            {amount > 0 && (
              <Button variant="primary" onClick={submit} loading={busy} disabled={reference.trim().length < 6}>
                {txt.manualPaySave}
              </Button>
            )}
          </InlineStack>
        </BlockStack>
      </div>
    </div>
  );
}
