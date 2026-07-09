"use client";
import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { Page, Layout, Card, Text, Button, Spinner, Badge, BlockStack, InlineStack, Banner } from "@shopify/polaris";

export default function InstalledAppsPage() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uninstalling, setUninstalling] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.request("/admin-hub/v1/app-store/installations");
      setInstallations(data?.installations || []);
    } catch {
      setInstallations([]);
    } finally {
      setLoading(false);
    }
  }

  async function uninstall(id, handle) {
    if (!confirm(`Uninstall ${handle}? All tokens will be revoked.`)) return;
    setUninstalling(id);
    try {
      const client = getMedusaAdminClient();
      await client.request(`/admin-hub/v1/app-store/installations/${id}`, { method: "DELETE" });
      setMsg({ type: "success", text: `${handle} uninstalled successfully.` });
      await load();
    } catch (e) {
      setMsg({ type: "critical", text: e?.message || "Could not uninstall." });
    } finally {
      setUninstalling(null);
    }
  }

  return (
    <DashboardLayout>
      <Page
        title={t("installed")}
        backAction={{ content: t("appStore"), url: `/${locale}/apps` }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {msg && (
                <Banner tone={msg.type} onDismiss={() => setMsg(null)}>
                  {msg.text}
                </Banner>
              )}
              {loading
                ? <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
                : installations.length === 0
                  ? (
                    <Card>
                      <div style={{ padding: 32, textAlign: "center" }}>
                        <BlockStack gap="300" inlineAlign="center">
                          <Text color="subdued">No apps installed yet.</Text>
                          <Button url={`/${locale}/apps`}>Browse App Store</Button>
                        </BlockStack>
                      </div>
                    </Card>
                  )
                  : installations.map(inst => {
                    const manifest = inst.manifest || {};
                    return (
                      <Card key={inst.id}>
                        <BlockStack gap="200">
                          <InlineStack align="space-between" wrap={false}>
                            <BlockStack gap="100">
                              <Text variant="headingMd">{manifest.name || inst.handle}</Text>
                              <Text variant="bodySm" color="subdued">
                                {inst.handle} · {inst.type === "shop_app" ? "Shop App" : "Integration"}
                              </Text>
                            </BlockStack>
                            <Badge tone="success">Active</Badge>
                          </InlineStack>
                          {inst.scopes?.length > 0 && (
                            <Text variant="bodySm" color="subdued">
                              Scopes: {inst.scopes.join(", ")}
                            </Text>
                          )}
                          <Text variant="bodySm" color="subdued">
                            Installed: {new Date(inst.installed_at).toLocaleDateString()}
                          </Text>
                          <InlineStack gap="200">
                            <Button
                              size="slim"
                              tone="critical"
                              loading={uninstalling === inst.id}
                              onClick={() => uninstall(inst.id, inst.handle)}
                            >
                              Uninstall
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Card>
                    );
                  })
              }
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
