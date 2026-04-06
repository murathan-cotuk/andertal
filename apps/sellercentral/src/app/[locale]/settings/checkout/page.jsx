"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Checkbox,
  Button,
  Banner,
  Box,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function SettingsCheckoutPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [stripePk, setStripePk] = useState("");
  const [stripeSk, setStripeSk] = useState("");
  const [payCard, setPayCard] = useState(true);
  const [payPaypal, setPayPaypal] = useState(false);
  const [payKlarna, setPayKlarna] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState("");
  const [paypalSecret, setPaypalSecret] = useState("");
  const [meta, setMeta] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const d = await getMedusaAdminClient().getPlatformCheckoutSettings();
      setStripePk(d.stripe_publishable_key || "");
      setStripeSk("");
      setPayCard(d.pay_card !== false);
      setPayPaypal(!!d.pay_paypal);
      setPayKlarna(!!d.pay_klarna);
      setPaypalClientId(d.paypal_client_id || "");
      setPaypalSecret("");
      setMeta(d);
    } catch (e) {
      setErr(e?.message || "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const body = {
        stripe_publishable_key: stripePk.trim(),
        pay_card: payCard,
        pay_paypal: payPaypal,
        pay_klarna: payKlarna,
        paypal_client_id: paypalClientId.trim(),
      };
      if (stripeSk.trim()) body.stripe_secret_key = stripeSk.trim();
      if (paypalSecret.trim()) body.paypal_client_secret = paypalSecret.trim();
      await getMedusaAdminClient().updatePlatformCheckoutSettings(body);
      setOk("Gespeichert.");
      setStripeSk("");
      setPaypalSecret("");
      await load();
    } catch (e) {
      setErr(e?.message || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Page title="Checkout & Zahlungen (Shop)">
        <Box padding="400">
          <Text tone="subdued">Laden…</Text>
        </Box>
      </Page>
    );
  }

  return (
    <Page title="Checkout & Zahlungen (Shop)">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Stripe-Schlüssel und aktivierte Zahlarten für den Shop-Checkout. Nur Superuser. PayPal/Klarna laufen über Stripe, falls Sie sie im Stripe-Dashboard aktiviert haben.
            </Text>

            {err ? (
              <Banner tone="critical" onDismiss={() => setErr("")}>
                <Text>{err}</Text>
              </Banner>
            ) : null}
            {ok ? (
              <Banner tone="success" onDismiss={() => setOk("")}>
                <Text>{ok}</Text>
              </Banner>
            ) : null}

            {(meta?.env_stripe_secret || meta?.env_stripe_publishable) ? (
              <Banner tone="info">
                <Text variant="bodySm">
                  Server-/Shop-Umgebungsvariablen sind gesetzt und überschreiben die Publishable-Keys bzw. den Secret aus der Datenbank: STRIPE_SECRET_KEY{" "}
                  {meta.env_stripe_secret ? "✓" : "—"}, Publishable {meta.env_stripe_publishable ? "✓" : "—"}.
                </Text>
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Stripe
                </Text>
                <Text tone="subdued" variant="bodySm">
                  Publishable Key (pk_…) kann hier oder als NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY im Shop gesetzt werden. Secret (sk_…): leeres Feld lässt den gespeicherten Wert unverändert.
                </Text>
                <TextField label="Stripe Publishable Key" value={stripePk} onChange={setStripePk} autoComplete="off" />
                <TextField
                  label="Stripe Secret Key (neu setzen)"
                  type="password"
                  value={stripeSk}
                  onChange={setStripeSk}
                  autoComplete="new-password"
                  helpText={
                    meta?.stripe_secret_key_set
                      ? `In DB gespeichert (${meta.stripe_secret_key_hint || "****"})`
                      : "Noch kein Secret nur in der Datenbank"
                  }
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Zahlarten im Checkout
                </Text>
                <Checkbox label="Kredit- / Debitkarte" checked={payCard} onChange={(v) => setPayCard(v)} />
                <Checkbox label="PayPal (Stripe)" checked={payPaypal} onChange={(v) => setPayPaypal(v)} />
                <Checkbox label="Klarna (Stripe)" checked={payKlarna} onChange={(v) => setPayKlarna(v)} />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  PayPal API (optional)
                </Text>
                <Text tone="subdued" variant="bodySm">
                  Zusätzliche Hinterlegung für spätere Integrationen; Live-Zahlung läuft primär über Stripe PaymentElement.
                </Text>
                <TextField label="PayPal Client ID" value={paypalClientId} onChange={setPaypalClientId} autoComplete="off" />
                <TextField
                  label="PayPal Client Secret (neu setzen)"
                  type="password"
                  value={paypalSecret}
                  onChange={setPaypalSecret}
                  autoComplete="new-password"
                  helpText={
                    meta?.paypal_client_secret_set
                      ? `Secret in DB (${meta.paypal_client_secret_hint || "****"})`
                      : "Optional"
                  }
                />
              </BlockStack>
            </Card>

            <Button variant="primary" onClick={save} loading={saving}>
              Speichern
            </Button>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
