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
  RadioButton,
  Button,
  Banner,
  Box,
  Spinner,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

const PM_LABELS = {
  card:               "Kredit- / Debitkarte",
  paypal:             "PayPal",
  klarna:             "Klarna",
  sepa_debit:         "SEPA-Lastschrift",
  ideal:              "iDEAL",
  bancontact:         "Bancontact",
  eps:                "EPS",
  p24:                "Przelewy24",
  giropay:            "Giropay",
  sofort:             "Sofort",
  link:               "Link (Stripe)",
  affirm:             "Affirm",
  afterpay_clearpay:  "Afterpay / Clearpay",
  blik:               "BLIK",
  cashapp:            "Cash App Pay",
  mobilepay:          "MobilePay",
  multibanco:         "Multibanco",
  oxxo:               "OXXO",
  paynow:             "PayNow",
  pix:                "Pix",
  promptpay:          "PromptPay",
  revolut_pay:        "Revolut Pay",
  swish:              "Swish",
  twint:              "TWINT",
  us_bank_account:    "US Bank Account (ACH)",
  wechat_pay:         "WeChat Pay",
  zip:                "Zip",
  amazon_pay:         "Amazon Pay",
  au_becs_debit:      "AU BECS Debit",
  bacs_debit:         "BACS Debit",
  boleto:             "Boleto",
  fpx:                "FPX",
  konbini:            "Konbini",
  acss_debit:         "ACSS Debit",
};

export default function SettingsCheckoutPage() {
  const unsaved = useUnsavedChanges();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stripePk, setStripePk] = useState("");
  const [stripeSk, setStripeSk] = useState("");
  const [paypalClientId, setPaypalClientId] = useState("");
  const [paypalSecret, setPaypalSecret] = useState("");
  const [paymentMethodLayout, setPaymentMethodLayout] = useState("grid");

  // Dynamic Stripe payment methods
  const [stripeMethods, setStripeMethods] = useState([]);     // available in Stripe
  const [selectedMethods, setSelectedMethods] = useState(["card"]); // checked = shown in shop
  const [stripeMethodsLoading, setStripeMethodsLoading] = useState(false);
  const [stripeMethodsErr, setStripeMethodsErr] = useState("");

  const [meta, setMeta] = useState(null);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [stripeTestBanner, setStripeTestBanner] = useState(null);

  const loadStripeMethods = useCallback(async (currentSelected) => {
    setStripeMethodsLoading(true);
    setStripeMethodsErr("");
    try {
      const d = await getMedusaAdminClient().getStripePaymentMethods();
      setStripeMethods(Array.isArray(d.available) ? d.available : []);
      // Use the already-selected methods from DB, not the ones Stripe returns as "selected"
      if (currentSelected !== undefined) {
        setSelectedMethods(currentSelected);
      } else if (Array.isArray(d.selected) && d.selected.length > 0) {
        setSelectedMethods(d.selected);
      }
    } catch (e) {
      setStripeMethodsErr(e?.message || "Stripe-Zahlmethoden konnten nicht geladen werden.");
    } finally {
      setStripeMethodsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const d = await getMedusaAdminClient().getPlatformCheckoutSettings();
      setStripePk(d.stripe_publishable_key || "");
      setStripeSk("");
      setPaypalClientId(d.paypal_client_id || "");
      setPaypalSecret("");
      setPaymentMethodLayout(d.payment_method_layout === "list" ? "list" : "grid");
      setMeta(d);

      // Determine current selected methods from DB
      const currentSelected = Array.isArray(d.payment_method_types_json) && d.payment_method_types_json.length > 0
        ? d.payment_method_types_json
        : [
            ...(d.pay_card !== false ? ["card"] : []),
            ...(d.pay_paypal ? ["paypal"] : []),
            ...(d.pay_klarna ? ["klarna"] : []),
          ].filter(Boolean) || ["card"];

      setSelectedMethods(currentSelected);

      setInitialSnapshot(JSON.stringify({
        stripePk: d.stripe_publishable_key || "",
        paypalClientId: d.paypal_client_id || "",
        paymentMethodLayout: d.payment_method_layout === "list" ? "list" : "grid",
        selectedMethods: [...currentSelected].sort(),
      }));

      // Load available Stripe methods in background
      loadStripeMethods(currentSelected);
    } catch (e) {
      setErr(e?.message || "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, [loadStripeMethods]);

  useEffect(() => { load(); }, [load]);

  const toggleMethod = (pmType) => {
    setSelectedMethods((prev) => {
      if (prev.includes(pmType)) {
        const next = prev.filter((m) => m !== pmType);
        return next.length > 0 ? next : prev; // mind. eine Methode
      }
      return [...prev, pmType];
    });
  };

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
        // Reload Stripe methods after successful key test
        loadStripeMethods(undefined);
      } else {
        setStripeTestBanner({ tone: "critical", text: r?.message || "Stripe-Verbindung fehlgeschlagen." });
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
          "Publishable Key wurde geändert, aber das Secret-Feld ist leer — der alte Secret Key in der Datenbank bleibt aktiv. Tragen Sie das neue Secret Key (sk_…) ein und speichern Sie erneut.",
        );
        setSaving(false);
        return;
      }
      const body = {
        stripe_publishable_key: stripePk.trim(),
        paypal_client_id: paypalClientId.trim(),
        payment_method_layout: paymentMethodLayout,
        payment_method_types: selectedMethods,
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
        paypalClientId: paypalClientId.trim(),
        paymentMethodLayout,
        selectedMethods: [...selectedMethods].sort(),
      }),
    [stripePk, paypalClientId, paymentMethodLayout, selectedMethods]
  );

  const isDirty = !loading && initialSnapshot !== null && currentSnapshot !== initialSnapshot;

  const discard = useCallback(() => {
    if (!meta) return;
    setStripePk(meta.stripe_publishable_key || "");
    setStripeSk("");
    setPaypalClientId(meta.paypal_client_id || "");
    setPaypalSecret("");
    setPaymentMethodLayout(meta.payment_method_layout === "list" ? "list" : "grid");
    const currentSelected = Array.isArray(meta.payment_method_types_json) && meta.payment_method_types_json.length > 0
      ? meta.payment_method_types_json
      : [
          ...(meta.pay_card !== false ? ["card"] : []),
          ...(meta.pay_paypal ? ["paypal"] : []),
          ...(meta.pay_klarna ? ["klarna"] : []),
        ].filter(Boolean) || ["card"];
    setSelectedMethods(currentSelected);
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
        <Box padding="400"><Text tone="subdued">Laden…</Text></Box>
      </Page>
    );
  }

  return (
    <Page title="Checkout & Zahlungen (Shop)">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Stripe-Schlüssel und aktivierte Zahlarten für den Shop-Checkout. Nur Superuser.
            </Text>

            {(meta?.env_stripe_secret || meta?.env_stripe_publishable) ? (
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  Auf Render/Vercel gesetzte STRIPE_* Umgebungsvariablen werden für den Shop-Checkout nicht verwendet. Maßgeblich sind ausschließlich die in Sellercentral gespeicherten Schlüssel (Datenbank).
                </Text>
              </Banner>
            ) : null}

            {err ? (
              <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>
            ) : null}
            {ok ? (
              <Banner tone="success" onDismiss={() => setOk("")}><Text>{ok}</Text></Banner>
            ) : null}

            {/* Stripe Keys */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Stripe</Text>
                <Text tone="subdued" variant="bodySm">
                  Publishable (pk_…) und Secret (sk_…) müssen zum selben Stripe-Konto gehören. Leeres Secret-Feld beim Speichern lässt den bisherigen Secret Key unverändert.
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
                      : "Noch kein Secret in der Datenbank"
                  }
                />
                {stripeTestBanner ? (
                  <Banner tone={stripeTestBanner.tone} onDismiss={() => setStripeTestBanner(null)}>
                    <Text as="p" variant="bodySm">{stripeTestBanner.text}</Text>
                  </Banner>
                ) : null}
              </BlockStack>
            </Card>

            {/* Dynamic payment methods from Stripe */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Zahlarten im Checkout</Text>
                  {stripeMethodsLoading && <Spinner size="small" />}
                </InlineStack>

                <Text tone="subdued" variant="bodySm">
                  Im Stripe-Dashboard aktivierte Zahlmethoden werden hier aufgelistet. Nur angehakte Methoden erscheinen im Shop-Checkout.
                </Text>

                {stripeMethodsErr ? (
                  <Banner tone="warning">
                    <Text as="p" variant="bodySm">{stripeMethodsErr}</Text>
                  </Banner>
                ) : null}

                {!stripeMethodsLoading && stripeMethods.length === 0 && !stripeMethodsErr ? (
                  <Text tone="subdued" variant="bodySm">
                    Keine Zahlmethoden gefunden. Stellen Sie sicher, dass der Stripe Secret Key gespeichert ist, und testen Sie die Verbindung.
                  </Text>
                ) : null}

                {stripeMethods.length > 0 && (
                  <BlockStack gap="200">
                    {stripeMethods.map((pmType) => (
                      <Checkbox
                        key={pmType}
                        label={PM_LABELS[pmType] || pmType}
                        checked={selectedMethods.includes(pmType)}
                        onChange={() => toggleMethod(pmType)}
                      />
                    ))}
                  </BlockStack>
                )}

                <BlockStack gap="200">
                  <Text variant="bodyMd" fontWeight="medium">Darstellung im Shop</Text>
                  <RadioButton
                    label="Tabs (nebeneinander)"
                    helpText="Zahlmethoden als horizontale Tabs anzeigen."
                    checked={paymentMethodLayout === "grid"}
                    id="layout-grid"
                    name="paymentMethodLayout"
                    onChange={() => setPaymentMethodLayout("grid")}
                  />
                  <RadioButton
                    label="Liste (untereinander)"
                    helpText="Zahlmethoden als vertikale Accordion-Liste anzeigen."
                    checked={paymentMethodLayout === "list"}
                    id="layout-list"
                    name="paymentMethodLayout"
                    onChange={() => setPaymentMethodLayout("list")}
                  />
                </BlockStack>
              </BlockStack>
            </Card>

            {/* PayPal API */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">PayPal API (optional)</Text>
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
              „Stripe-Verbindung testen" ruft balance.retrieve auf und lädt danach die verfügbaren Zahlmethoden neu.
            </Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
