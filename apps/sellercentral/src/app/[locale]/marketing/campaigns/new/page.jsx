"use client";

import { useEffect, useState, useRef } from "react";
import { Page, Card, Banner, Spinner, BlockStack, Button, InlineStack } from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";

export default function MarketingCampaignNewRoute() {
  const router = useRouter();
  const [error, setError] = useState(null);
  const createStarted = useRef(false);

  useEffect(() => {
    if (createStarted.current) return;
    createStarted.current = true;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const client = getMedusaAdminClient();
        const res = await client.createCampaign({
          name: "Neue Werbekampagne",
          description: "",
          target_type: "products",
          product_ids: [],
          group_ids: [],
          variant_ids: [],
          budget_daily_cents: 100,
          bid_strategy: "cpc",
          ad_platforms: [],
          start_at: null,
          end_at: null,
          campaign_type: "ppc",
          discount_type: "percentage",
          discount_value: 0,
          status: "draft",
        });
        const id = res?.campaign?.id;
        if (!id) throw new Error("Keine Kampagnen-ID von der API erhalten.");
        if (!cancelled) router.replace(`/marketing/campaigns/${id}`);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Kampagne konnte nicht angelegt werden.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <DashboardLayout>
      <Page title="Neue Kampagne" backAction={{ content: "Zurück", url: "/marketing/campaigns" }}>
        <Card>
          <div style={{ padding: 32, textAlign: "center" }}>
            <BlockStack gap="400">
              {error ? (
                <BlockStack gap="300">
                  <Banner tone="critical">{error}</Banner>
                  <InlineStack gap="200">
                    <Button url="/marketing/campaigns">Zur Übersicht</Button>
                    <Button variant="primary" onClick={() => window.location.reload()}>Erneut versuchen</Button>
                  </InlineStack>
                </BlockStack>
              ) : (
                <>
                  <Spinner accessibilityLabel="Anlegen" size="large" />
                  <BlockStack gap="100">
                    <span style={{ fontSize: 14, color: "#6d7175" }}>Kampagne wird angelegt …</span>
                  </BlockStack>
                </>
              )}
            </BlockStack>
          </div>
        </Card>
      </Page>
    </DashboardLayout>
  );
}
