"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Banner,
  Box,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { getInventorySettingsCopy } from "@/lib/inventory-settings-i18n";

export default function InventorySettingsPage() {
  const locale = useLocale();
  const router = useRouter();
  const copy = getInventorySettingsCopy(locale);
  const unsaved = useUnsavedChanges();

  const [isSuperuser, setIsSuperuser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [newWindowDays, setNewWindowDays] = useState("15");
  const [bestsellerMinSold, setBestsellerMinSold] = useState("1");
  const [bestsellerTopPerCategory, setBestsellerTopPerCategory] = useState("1");
  const [saleMinDiscountPercent, setSaleMinDiscountPercent] = useState("0");
  const [initialSnapshot, setInitialSnapshot] = useState(null);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (!su) router.replace("/inventory");
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const d = await getMedusaAdminClient().getSellerSettings("default");
      setNewWindowDays(String(d.new_product_window_days));
      setBestsellerMinSold(String(d.bestseller_min_sold));
      setBestsellerTopPerCategory(String(d.bestseller_top_per_category));
      setSaleMinDiscountPercent(String(d.sale_min_discount_percent));
      setInitialSnapshot(JSON.stringify({
        newWindowDays: String(d.new_product_window_days),
        bestsellerMinSold: String(d.bestseller_min_sold),
        bestsellerTopPerCategory: String(d.bestseller_top_per_category),
        saleMinDiscountPercent: String(d.sale_min_discount_percent),
      }));
    } catch (e) {
      setErr(e?.message || copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError]);

  useEffect(() => {
    if (isSuperuser) load();
  }, [isSuperuser, load]);

  const save = useCallback(async () => {
    setSaving(true);
    setErr("");
    setOk("");
    const n = Math.max(1, Math.min(3650, Math.round(Number(newWindowDays) || 15)));
    const sold = Math.max(1, Math.min(1000000, Math.round(Number(bestsellerMinSold) || 1)));
    const top = Math.max(1, Math.min(50, Math.round(Number(bestsellerTopPerCategory) || 1)));
    const pct = Math.max(0, Math.min(99, Math.round(Number(saleMinDiscountPercent) || 0)));
    setNewWindowDays(String(n));
    setBestsellerMinSold(String(sold));
    setBestsellerTopPerCategory(String(top));
    setSaleMinDiscountPercent(String(pct));
    try {
      await getMedusaAdminClient().updateSellerSettings({
        seller_id: "default",
        new_product_window_days: n,
        bestseller_min_sold: sold,
        bestseller_top_per_category: top,
        sale_min_discount_percent: pct,
      });
      setOk(copy.saved);
      setInitialSnapshot(JSON.stringify({
        newWindowDays: String(n),
        bestsellerMinSold: String(sold),
        bestsellerTopPerCategory: String(top),
        saleMinDiscountPercent: String(pct),
      }));
      return true;
    } catch (e) {
      setErr(e?.message || copy.saveError);
      return false;
    } finally {
      setSaving(false);
    }
  }, [newWindowDays, bestsellerMinSold, bestsellerTopPerCategory, saleMinDiscountPercent, copy.saved, copy.saveError]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ newWindowDays, bestsellerMinSold, bestsellerTopPerCategory, saleMinDiscountPercent }),
    [newWindowDays, bestsellerMinSold, bestsellerTopPerCategory, saleMinDiscountPercent]
  );
  const isDirty = !loading && initialSnapshot != null && currentSnapshot !== initialSnapshot;

  const discard = useCallback(() => { load(); setErr(""); setOk(""); }, [load]);

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
    unsaved.setHandlers({ onSave: save, onDiscard: discard });
    return () => {
      unsaved.clearHandlers();
      unsaved.setDirty(false);
    };
  }, [unsaved, isDirty, save, discard]);

  if (isSuperuser === null || !isSuperuser) return null;

  if (loading) {
    return (
      <Page title={copy.pageTitle} backAction={{ onAction: () => router.push("/inventory") }}>
        <Box padding="400"><Text tone="subdued">…</Text></Box>
      </Page>
    );
  }

  return (
    <Page title={copy.pageTitle} backAction={{ onAction: () => router.push("/inventory") }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">{copy.pageIntro}</Text>

            {err ? <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner> : null}
            {ok ? <Banner tone="success" onDismiss={() => setOk("")}><Text>{ok}</Text></Banner> : null}

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">{copy.newSectionTitle}</Text>
                <Text tone="subdued" variant="bodySm">{copy.newSectionHelp}</Text>
                <Box maxWidth="280px">
                  <TextField
                    label={copy.newWindowDaysLabel}
                    type="number"
                    min={1}
                    autoComplete="off"
                    value={newWindowDays}
                    onChange={setNewWindowDays}
                    helpText={copy.newWindowDaysHelp}
                    suffix={locale === "tr" ? "gün" : locale === "en" ? "days" : "Tage"}
                  />
                </Box>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">{copy.bestsellerSectionTitle}</Text>
                <Text tone="subdued" variant="bodySm">{copy.bestsellerSectionHelp}</Text>
                <InlineStack gap="400" wrap>
                  <Box minWidth="220px">
                    <TextField
                      label={copy.bestsellerMinSoldLabel}
                      type="number"
                      min={1}
                      autoComplete="off"
                      value={bestsellerMinSold}
                      onChange={setBestsellerMinSold}
                      helpText={copy.bestsellerMinSoldHelp}
                    />
                  </Box>
                  <Box minWidth="220px">
                    <TextField
                      label={copy.bestsellerTopPerCategoryLabel}
                      type="number"
                      min={1}
                      autoComplete="off"
                      value={bestsellerTopPerCategory}
                      onChange={setBestsellerTopPerCategory}
                      helpText={copy.bestsellerTopPerCategoryHelp}
                    />
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">{copy.saleSectionTitle}</Text>
                <Text tone="subdued" variant="bodySm">{copy.saleSectionHelp}</Text>
                <Box maxWidth="280px">
                  <TextField
                    label={copy.saleMinDiscountPercentLabel}
                    type="number"
                    min={0}
                    max={99}
                    autoComplete="off"
                    value={saleMinDiscountPercent}
                    onChange={setSaleMinDiscountPercent}
                    helpText={copy.saleMinDiscountPercentHelp}
                    suffix="%"
                  />
                </Box>
              </BlockStack>
            </Card>

            <InlineStack gap="300">
              <Button variant="primary" onClick={save} loading={saving}>{copy.save}</Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
