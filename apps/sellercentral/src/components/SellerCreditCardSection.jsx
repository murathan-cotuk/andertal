"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Banner, BlockStack, Button, InlineStack, Spinner, Text } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";

// Brand icons as simple text + color
const BRAND_LABEL = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  unionpay: "UnionPay",
  jcb: "JCB",
  diners: "Diners Club",
};

function CardDisplay({ brand, last4, expMonth, expYear }) {
  const brandLabel = BRAND_LABEL[brand?.toLowerCase()] || (brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Karte");
  const exp = expMonth && expYear ? `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}` : null;
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      background: "#f9fafb",
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      padding: "12px 16px",
      minWidth: 220,
    }}>
      <div style={{
        width: 40, height: 26,
        background: "#1a1a2e",
        borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
          {(brand || "CARD").toUpperCase().slice(0, 4)}
        </span>
      </div>
      <BlockStack gap="050">
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {brandLabel} •••• {last4}
        </Text>
        {exp && (
          <Text as="p" variant="bodySm" tone="subdued">Läuft ab {exp}</Text>
        )}
      </BlockStack>
    </div>
  );
}

export default function SellerCreditCardSection({ title, subtitle, compact = false }) {
  const client = getMedusaAdminClient();

  const [loading, setLoading] = useState(true);
  const [cardInfo, setCardInfo] = useState(null); // { has_card, last4, brand, exp_month, exp_year }
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [stripeReady, setStripeReady] = useState(false);
  const [publishableKey, setPublishableKey] = useState(null);

  const cardRef = useRef(null);
  const stripeRef = useRef(null);
  const cardElementRef = useRef(null);

  // Load card info on mount
  useEffect(() => {
    (async () => {
      try {
        const [cardData, pkData] = await Promise.all([
          client.getSellerCard(),
          client.getStripePublishableKey(),
        ]);
        setCardInfo(cardData);
        setPublishableKey(pkData?.publishable_key || null);
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, [client]);

  // Load Stripe.js from CDN
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Stripe) { setStripeReady(true); return; }
    const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
    if (existing) {
      existing.addEventListener("load", () => setStripeReady(true));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => setStripeReady(true);
    document.head.appendChild(script);
  }, []);

  // Mount Stripe card element when adding
  useEffect(() => {
    if (!adding || !stripeReady || !publishableKey || !cardRef.current) return;
    const stripe = window.Stripe(publishableKey);
    const elements = stripe.elements();
    const cardElement = elements.create("card", {
      hidePostalCode: true,
      style: {
        base: {
          fontSize: "14px",
          color: "#202223",
          fontFamily: "inherit",
          "::placeholder": { color: "#6d7175" },
        },
        invalid: { color: "#d72c0d" },
      },
    });
    cardElement.mount(cardRef.current);
    stripeRef.current = stripe;
    cardElementRef.current = cardElement;
    return () => {
      try { cardElement.unmount(); } catch (_) {}
      stripeRef.current = null;
      cardElementRef.current = null;
    };
  }, [adding, stripeReady, publishableKey]);

  const handleSave = useCallback(async () => {
    if (!stripeRef.current || !cardElementRef.current) return;
    setErr(""); setSaving(true);
    try {
      const { client_secret } = await client.createSellerCardSetupIntent();
      const result = await stripeRef.current.confirmCardSetup(client_secret, {
        payment_method: { card: cardElementRef.current },
      });
      if (result.error) {
        setErr(result.error.message || "Kartenfehler.");
        return;
      }
      const pmId = result.setupIntent?.payment_method;
      if (!pmId) { setErr("Keine Karten-ID zurückgegeben."); return; }
      const saved = await client.confirmSellerCard(pmId);
      setCardInfo({ has_card: true, last4: saved.last4, brand: saved.brand, exp_month: saved.exp_month, exp_year: saved.exp_year });
      setAdding(false);
      setOk("Karte erfolgreich gespeichert.");
    } catch (e) {
      setErr(e?.message || "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }, [client]);

  const handleDelete = useCallback(async () => {
    if (!(await confirmDelete("Karte wirklich entfernen?"))) return;
    setErr(""); setDeleting(true);
    try {
      await client.deleteSellerCard();
      setCardInfo({ has_card: false, last4: null, brand: null, exp_month: null, exp_year: null });
      setOk("Karte entfernt.");
    } catch (e) {
      setErr(e?.message || "Fehler beim Entfernen.");
    } finally {
      setDeleting(false);
    }
  }, [client]);

  if (loading) return <Spinner size="small" />;

  const displayTitle = title ?? "Kreditkarte für Gebühren";
  const displaySubtitle = subtitle ?? "Diese Karte wird verwendet, wenn dein Guthaben für Plattformgebühren oder Rückbuchungen nicht ausreicht.";

  return (
    <BlockStack gap="300">
      {!compact && (
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">{displayTitle}</Text>
            <Text as="p" tone="subdued" variant="bodySm">{displaySubtitle}</Text>
          </BlockStack>
          {!adding && (
            <Button onClick={() => { setAdding(true); setErr(""); setOk(""); }} size="slim">
              {cardInfo?.has_card ? "Ändern" : "Hinzufügen"}
            </Button>
          )}
        </InlineStack>
      )}

      {ok && <Banner tone="success" onDismiss={() => setOk("")}>{ok}</Banner>}
      {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}

      {!adding && (
        cardInfo?.has_card ? (
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <CardDisplay
              brand={cardInfo.brand}
              last4={cardInfo.last4}
              expMonth={cardInfo.exp_month}
              expYear={cardInfo.exp_year}
            />
            {compact && (
              <Button onClick={() => { setAdding(true); setErr(""); setOk(""); }} size="slim">Ändern</Button>
            )}
            <Button tone="critical" variant="plain" onClick={handleDelete} loading={deleting} size="slim">
              Entfernen
            </Button>
          </InlineStack>
        ) : (
          <div style={{ background: "#fffbeb", borderRadius: 10, padding: "14px 18px", border: "1px solid #fde68a" }}>
            <InlineStack gap="300" blockAlign="center">
              <span style={{ fontSize: 20 }}>💳</span>
              <BlockStack gap="050">
                <Text as="p" variant="bodyMd" fontWeight="semibold">Keine Kreditkarte hinterlegt</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Bitte füge eine Karte hinzu, damit Gebühren und Rückbuchungen abgewickelt werden können.
                </Text>
              </BlockStack>
              {compact && (
                <Button onClick={() => { setAdding(true); setErr(""); setOk(""); }} size="slim">Hinzufügen</Button>
              )}
            </InlineStack>
          </div>
        )
      )}

      {adding && (
        <BlockStack gap="300">
          {!publishableKey ? (
            <Banner tone="warning">
              Stripe ist noch nicht konfiguriert. Bitte wende dich an den Support.
            </Banner>
          ) : !stripeReady ? (
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="p" variant="bodySm" tone="subdued">Stripe wird geladen…</Text>
            </InlineStack>
          ) : (
            <BlockStack gap="300">
              <div>
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Kartendaten</Text>
                <div
                  ref={cardRef}
                  style={{
                    marginTop: 6,
                    border: "1px solid #8c9196",
                    borderRadius: 6,
                    padding: "10px 12px",
                    background: "#fff",
                    minHeight: 38,
                  }}
                />
              </div>
              <InlineStack gap="200">
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  {saving ? "Wird gespeichert…" : "Karte speichern"}
                </Button>
                <Button onClick={() => { setAdding(false); setErr(""); }} disabled={saving}>
                  Abbrechen
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      )}
    </BlockStack>
  );
}
