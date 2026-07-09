"use client";
import { useState, useEffect, use } from "react";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { Page, Layout, Card, Text, Button, Spinner, Badge, BlockStack, InlineStack, List, Banner } from "@shopify/polaris";

const SCOPE_DESCRIPTIONS = {
  read_orders: "Read your orders",
  write_orders: "Manage your orders",
  read_products: "Read your products",
  write_products: "Manage your products",
  write_inventory: "Update product inventory",
  write_fulfillments: "Create fulfillments and tracking",
  read_customers: "Read customer data",
  write_customers: "Manage customers",
  read_analytics: "Read analytics data",
  read_shipping: "Read shipping settings",
  write_shipping: "Manage shipping",
  read_discounts: "Read discounts",
  write_discounts: "Manage discounts",
  write_storefront: "Customize your storefront",
  write_checkout: "Customize checkout",
  read_seller: "Read your seller profile",
  write_seller: "Update your seller profile",
};

export default function AppDetailPage({ params }) {
  const { handle } = use(params);
  const locale = useLocale();
  const t = useTranslations("nav");
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    getMedusaAdminClient()
      .request(`/admin-hub/v1/app-store/apps/${handle}`)
      .then(data => setApp(data?.app || null))
      .catch(() => setApp(null))
      .finally(() => setLoading(false));
  }, [handle]);

  async function install() {
    setInstalling(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.request(`/admin-hub/v1/app-store/apps/${handle}/install`, { method: "POST" });
      if (data?.authorize_url) {
        window.location.href = data.authorize_url;
      }
    } catch (e) {
      setMsg({ type: "critical", text: e?.message || "Could not start installation." });
    } finally {
      setInstalling(false);
    }
  }

  if (loading) return (
    <DashboardLayout>
      <Page><div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spinner /></div></Page>
    </DashboardLayout>
  );

  if (!app) return (
    <DashboardLayout>
      <Page backAction={{ content: t("appStore"), url: `/${locale}/apps` }} title="App not found">
        <Card><div style={{ padding: 32, textAlign: "center", color: "#888" }}>This app is not available.</div></Card>
      </Page>
    </DashboardLayout>
  );

  const manifest = app.manifest || {};
  const scopes = manifest.scopes || [];

  return (
    <DashboardLayout>
      <Page
        title={manifest.name || app.handle}
        backAction={{ content: t("appStore"), url: `/${locale}/apps` }}
        primaryAction={{ content: "Install", loading: installing, onAction: install }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {msg && <Banner tone={msg.type} onDismiss={() => setMsg(null)}>{msg.text}</Banner>}

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" wrap={false}>
                    <BlockStack gap="100">
                      <Text variant="headingLg">{manifest.name || app.handle}</Text>
                      <Text color="subdued">by {app.developer_name || "Developer"}</Text>
                    </BlockStack>
                    <BlockStack gap="100" inlineAlign="end">
                      <Badge tone="success">{app.type === "shop_app" ? "Shop App" : "Integration"}</Badge>
                      <Text variant="bodySm" color="subdued">{app.install_count ?? 0} installs</Text>
                    </BlockStack>
                  </InlineStack>
                  {manifest.description && (
                    <Text>{manifest.description}</Text>
                  )}
                  {app.version && (
                    <Text variant="bodySm" color="subdued">Version {app.version}</Text>
                  )}
                </BlockStack>
              </Card>

              {scopes.length > 0 && (
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd">Requested permissions</Text>
                    <Text color="subdued" variant="bodySm">
                      This app will request access to the following data when installed:
                    </Text>
                    <List>
                      {scopes.map(s => (
                        <List.Item key={s}>
                          <Text variant="bodySm"><strong>{s}</strong> — {SCOPE_DESCRIPTIONS[s] || s}</Text>
                        </List.Item>
                      ))}
                    </List>
                  </BlockStack>
                </Card>
              )}

              {manifest.privacy_policy_url && (
                <Card>
                  <Text variant="bodySm">
                    <a href={manifest.privacy_policy_url} target="_blank" rel="noopener noreferrer">
                      Privacy Policy
                    </a>
                  </Text>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">About</Text>
                <BlockStack gap="100">
                  <Text variant="bodySm" color="subdued">Category</Text>
                  <Text>{manifest.category || "—"}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text variant="bodySm" color="subdued">Type</Text>
                  <Text>{app.type === "shop_app" ? "Shop App" : "Integration App"}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text variant="bodySm" color="subdued">Developer</Text>
                  <Text>{app.developer_name || "—"}</Text>
                </BlockStack>
                <Button fullWidth variant="primary" loading={installing} onClick={install}>
                  Install app
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
