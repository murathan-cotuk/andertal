"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Checkbox,
  Button,
  Banner,
  Box,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

export default function SettingsCheckoutPage() {
  const unsaved = useUnsavedChanges();
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
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [stripeTestBanner, setStripeTestBanner] = useState(null);

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
      setInitialSnapshot(JSON.stringify({
        stripePk: d.stripe_publishable_key || "",
        payCard: d.pay_card !== false,
        payPaypal: !!d.pay_paypal,
        payKlarna: !!d.pay_klarna,
        paypalClientId: d.paypal_client_id || "",
      }));
    } catch (e) {
      setErr(e?.message || "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const testStripe = async () => {
    setStripeTestBanner(null);
    setTestLoading(true);
    try {
      const payload = {};
      const pk = stripePk.trim();
      const sk = stripeSk.trim();
      if (pk) payload.stripe_publishable_key = pk;
      if (sk) payload.stripe_secret_key = sk;
      const r = await getMedusaAdminClient().testPlatformStripeConnection(payload);
      if (r?.ok) {
        const extra = r.mode ? ` (${r.mode === "test" ? "Testmodus" : "Live"})` : "";
        setStripeTestBanner({ tone: "success", text: `${r.message || "Verbindung erfolgreich."}${extra}` });
      } else {
        setStripeTestBanner({
          tone: "critical",
          text: r?.message || "Stripe-Verbindung fehlgeschlagen.",
        });
      }
    } catch (e) {
      setStripeTestBanner({ tone: "critical", text: e?.message || "Anfrage fehlgeschlagen." });
    } finally {
      setTestLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const prevPk = (meta?.stripe_publishable_key || "").trim();
      const pkChanged = stripePk.trim() !== prevPk;
      if (pkChanged && !stripeSk.trim()) {
        setErr(
          "Publishable Key wurde geändert, aber das Secret-Feld ist leer — der alte Secret Key in der Datenbank bleibt aktiv. Zahlungen laufen weiterhin über das alte Stripe-Konto. Tragen Sie das neue Secret Key (sk_…) ein und speichern Sie erneut.",
        );
        setSaving(false);
        return;
      }
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

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        stripePk: stripePk.trim(),
        payCard: !!payCard,
        payPaypal: !!payPaypal,
        payKlarna: !!payKlarna,
        paypalClientId: paypalClientId.trim(),
      }),
    [stripePk, payCard, payPaypal, payKlarna, paypalClientId]
  );
  const isDirty = !loading && initialSnapshot !== null && currentSnapshot !== initialSnapshot;

  const discard = useCallback(() => {
    if (!meta) return;
    setStripePk(meta.stripe_publishable_key || "");
    setStripeSk("");
    setPayCard(meta.pay_card !== false);
    setPayPaypal(!!meta.pay_paypal);
    setPayKlarna(!!meta.pay_klarna);
    setPaypalClientId(meta.paypal_client_id || "");
    setPaypalSecret("");
    setErr("");
    setOk("");
  }, [meta]);

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
    unsaved.setHandlers({ onSave: save, onDiscard: discard });
    return () => {
      unsaved.clearHandlers();
      unsaved.setDirty(false);
    };
  }, [unsaved, isDirty, save, discard]);

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

            {(meta?.env_stripe_secret || meta?.env_stripe_publishable) ? (
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  Auf Render/Vercel gesetzte STRIPE_* Umgebungsvariablen werden für den Shop-Checkout nicht verwendet. Maßgeblich sind ausschließlich die in Sellercentral gespeicherten Schlüssel (Datenbank).
                </Text>
              </Banner>
            ) : null}

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

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Stripe
                </Text>
                <Text tone="subdued" variant="bodySm">
                  Publishable (pk_…) und Secret (sk_…) müssen zum selben Stripe-Konto gehören. Leeres Secret-Feld beim Speichern lässt den bisherigen Secret Key in der Datenbank unverändert — nur publishable zu ändern reicht nicht; ohne neues Secret bleiben alle Zahlungen beim alten Konto.
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
                {stripeTestBanner ? (
                  <Banner tone={stripeTestBanner.tone} onDismiss={() => setStripeTestBanner(null)}>
                    <Text as="p" variant="bodySm">{stripeTestBanner.text}</Text>
                  </Banner>
                ) : null}
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

            <InlineStack gap="300" blockAlign="center">
              <Button variant="primary" onClick={save} loading={saving}>
                Speichern
              </Button>
              <Button onClick={testStripe} loading={testLoading} disabled={saving}>
                Stripe-Verbindung testen
              </Button>
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">
              Der Test ruft bei Stripe balance.retrieve auf — Secret aus dem Formular, oder wenn leer das zuletzt gespeicherte Secret aus der Datenbank. Der Publishable Key wird nur auf Test/Live-Konsistenz gegenüber dem Secret geprüft.
            </Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
