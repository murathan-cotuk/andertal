"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { Page, Layout, Card, Text, Button, TextField, Spinner, Badge, BlockStack, InlineStack } from "@shopify/polaris";

const CATEGORIES = ["all", "shipping", "accounting", "marketing", "inventory", "customer_service", "payments", "storefront", "other"];

const STATUS_BADGE = { published: "success", draft: "info", submitted: "warning", rejected: "critical" };

export default function AppStorePage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("nav");
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [installing, setInstalling] = useState(null);

  useEffect(() => {
    load();
  }, [category]);

  async function load() {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const params = new URLSearchParams();
      if (category && category !== "all") params.set("category", category);
      if (q) params.set("q", q);
      const data = await client.request(`/admin-hub/v1/app-store/apps?${params}`);
      setApps(data?.apps || []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }

  async function install(handle) {
    setInstalling(handle);
    try {
      const client = getMedusaAdminClient();
      const data = await client.request(`/admin-hub/v1/app-store/apps/${handle}/install`, { method: "POST" });
      if (data?.authorize_url) {
        window.location.href = data.authorize_url;
      }
    } catch (e) {
      alert(e?.message || "Could not start installation");
    } finally {
      setInstalling(null);
    }
  }

  return (
    <DashboardLayout>
      <Page
        title={t("appStore")}
        subtitle="Extend your store with third-party integrations"
        secondaryActions={[{ content: t("installed"), url: `/${locale}/apps/installed` }]}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <InlineStack gap="200" wrap>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <TextField
                    label=""
                    value={q}
                    onChange={setQ}
                    placeholder="Search apps…"
                    autoComplete="off"
                    connectedRight={<Button onClick={load}>Search</Button>}
                  />
                </div>
                <InlineStack gap="100" wrap>
                  {CATEGORIES.map(c => (
                    <Button
                      key={c}
                      size="slim"
                      pressed={category === c}
                      onClick={() => setCategory(c)}
                    >
                      {c === "all" ? "All" : c.replace("_", " ")}
                    </Button>
                  ))}
                </InlineStack>
              </InlineStack>

              {loading
                ? <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
                : apps.length === 0
                  ? <Card><div style={{ padding: 32, textAlign: "center", color: "#888" }}>No apps found.</div></Card>
                  : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                    {apps.map(app => {
                      const manifest = app.manifest || {};
                      return (
                        <Card key={app.id}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <Text variant="headingMd">{manifest.name || app.handle}</Text>
                              <Badge tone={STATUS_BADGE[app.status] || "info"}>{app.type === "shop_app" ? "Shop App" : "Integration"}</Badge>
                            </InlineStack>
                            <Text color="subdued" variant="bodySm">{(manifest.description || "").slice(0, 120)}</Text>
                            <Text variant="bodySm" color="subdued">{app.install_count ?? 0} installs</Text>
                            <InlineStack gap="200">
                              <Button size="slim" url={`/${locale}/apps/${app.handle}`}>Details</Button>
                              <Button
                                size="slim"
                                variant="primary"
                                loading={installing === app.handle}
                                onClick={() => install(app.handle)}
                              >
                                Install
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Card>
                      );
                    })}
                  </div>
              }
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
