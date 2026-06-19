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
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { useUI } from "@/lib/ui-strings";
import { getCheckoutCopy, paymentMethodLabel } from "@/lib/checkout-i18n";

export default function SettingsCheckoutPage() {
  const locale = useLocale();
  const ui = useUI();
  const copy = getCheckoutCopy(locale);
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

  const [stripeMethods, setStripeMethods] = useState([]);
  const [selectedMethods, setSelectedMethods] = useState(["card"]);
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
      if (currentSelected !== undefined) {
        setSelectedMethods(currentSelected);
      } else if (Array.isArray(d.selected) && d.selected.length > 0) {
        setSelectedMethods(d.selected);
      }
    } catch (e) {
      setStripeMethodsErr(e?.message || copy.methodsLoadError);
    } finally {
      setStripeMethodsLoading(false);
    }
  }, [copy.methodsLoadError]);

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

      loadStripeMethods(currentSelected);
    } catch (e) {
      setErr(e?.message || copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [loadStripeMethods, copy.loadError]);

  useEffect(() => { load(); }, [load]);

  const toggleMethod = (pmType) => {
    setSelectedMethods((prev) => {
      if (prev.includes(pmType)) {
        const next = prev.filter((m) => m !== pmType);
        return next.length > 0 ? next : prev;
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
        const extra = r.mode ? ` (${r.mode === "test" ? copy.testMode : copy.liveMode})` : "";
        setStripeTestBanner({ tone: "success", text: `${r.message || copy.connectionOk}${extra}` });
        loadStripeMethods(undefined);
      } else {
        setStripeTestBanner({ tone: "critical", text: r?.message || copy.connectionFailed });
      }
    } catch (e) {
      setStripeTestBanner({ tone: "critical", text: e?.message || copy.requestFailed });
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
        setErr(copy.pkChangedNoSk);
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
      setOk(copy.saved);
      setStripeSk("");
      setPaypalSecret("");
      await load();
    } catch (e) {
      setErr(e?.message || copy.saveError);
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
      <Page title={copy.pageTitle}>
        <Box padding="400"><Text tone="subdued">{ui.loading}</Text></Box>
      </Page>
    );
  }

  return (
    <Page title={copy.pageTitle}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">{copy.pageIntro}</Text>

            {(meta?.env_stripe_secret || meta?.env_stripe_publishable) ? (
              <Banner tone="info">
                <Text as="p" variant="bodySm">{copy.envBanner}</Text>
              </Banner>
            ) : null}

            {err ? (
              <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>
            ) : null}
            {ok ? (
              <Banner tone="success" onDismiss={() => setOk("")}><Text>{ok}</Text></Banner>
            ) : null}

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">{copy.stripeTitle}</Text>
                <Text tone="subdued" variant="bodySm">{copy.stripeHelp}</Text>
                <TextField label={copy.stripePk} value={stripePk} onChange={setStripePk} autoComplete="off" />
                <TextField
                  label={copy.stripeSk}
                  type="password"
                  value={stripeSk}
                  onChange={setStripeSk}
                  autoComplete="new-password"
                  helpText={
                    meta?.stripe_secret_key_set
                      ? copy.secretInDb(meta.stripe_secret_key_hint)
                      : copy.noSecretInDb
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
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">{copy.methodsTitle}</Text>
                  {stripeMethodsLoading && <Spinner size="small" />}
                </InlineStack>

                <Text tone="subdued" variant="bodySm">{copy.methodsHelp}</Text>

                {stripeMethodsErr ? (
                  <Banner tone="warning">
                    <Text as="p" variant="bodySm">{stripeMethodsErr}</Text>
                  </Banner>
                ) : null}

                {!stripeMethodsLoading && stripeMethods.length === 0 && !stripeMethodsErr ? (
                  <Text tone="subdued" variant="bodySm">{copy.noMethods}</Text>
                ) : null}

                {stripeMethods.length > 0 && (
                  <BlockStack gap="200">
                    {stripeMethods.map((pmType) => (
                      <Checkbox
                        key={pmType}
                        label={paymentMethodLabel(locale, pmType)}
                        checked={selectedMethods.includes(pmType)}
                        onChange={() => toggleMethod(pmType)}
                      />
                    ))}
                  </BlockStack>
                )}

                <BlockStack gap="200">
                  <Text variant="bodyMd" fontWeight="medium">{copy.displayTitle}</Text>
                  <RadioButton
                    label={copy.layoutTabs}
                    helpText={copy.layoutTabsHelp}
                    checked={paymentMethodLayout === "grid"}
                    id="layout-grid"
                    name="paymentMethodLayout"
                    onChange={() => setPaymentMethodLayout("grid")}
                  />
                  <RadioButton
                    label={copy.layoutList}
                    helpText={copy.layoutListHelp}
                    checked={paymentMethodLayout === "list"}
                    id="layout-list"
                    name="paymentMethodLayout"
                    onChange={() => setPaymentMethodLayout("list")}
                  />
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">{copy.paypalTitle}</Text>
                <Text tone="subdued" variant="bodySm">{copy.paypalHelp}</Text>
                <TextField label={copy.paypalClientId} value={paypalClientId} onChange={setPaypalClientId} autoComplete="off" />
                <TextField
                  label={copy.paypalSecret}
                  type="password"
                  value={paypalSecret}
                  onChange={setPaypalSecret}
                  autoComplete="new-password"
                  helpText={
                    meta?.paypal_client_secret_set
                      ? copy.secretInDb(meta.paypal_client_secret_hint)
                      : copy.optional
                  }
                />
              </BlockStack>
            </Card>

            <InlineStack gap="300" blockAlign="center">
              <Button variant="primary" onClick={save} loading={saving}>{ui.save}</Button>
              <Button onClick={testStripe} loading={testLoading} disabled={saving}>{copy.testStripe}</Button>
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">{copy.testStripeHint}</Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
