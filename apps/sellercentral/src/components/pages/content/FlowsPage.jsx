"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page, Layout, Card, Text, Button, Badge, BlockStack, InlineStack,
  Box, Spinner, Banner, Modal, TextField, Select, EmptyState, Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const client = getMedusaAdminClient();

const TRIGGER_OPTIONS = [
  { label: "Yeni abone / New subscriber", value: "new_subscriber" },
  { label: "Terk edilen sepet / Abandoned cart", value: "abandoned_cart" },
  { label: "Sipariş oluşturuldu / Order placed", value: "order_placed" },
  { label: "Sipariş teslim edildi / Order delivered", value: "order_delivered" },
  { label: "Yorum isteği / Review request", value: "review_request" },
  { label: "Pasif müşteri / Win-back", value: "win_back" },
];

const TRIGGER_LABELS = Object.fromEntries(TRIGGER_OPTIONS.map((o) => [o.value, o.label]));

const STATUS_BADGE = {
  active: { tone: "success", label: "Aktif" },
  draft: { tone: "info", label: "Taslak" },
  paused: { tone: "warning", label: "Duraklatıldı" },
};

export default function FlowsPage() {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("abandoned_cart");
  const [newNameErr, setNewNameErr] = useState("");

  const [smtpConfigured, setSmtpConfigured] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [flowsRes, smtpRes] = await Promise.allSettled([
        client.getFlows?.() ?? Promise.resolve({ flows: [] }),
        client.getSmtpSettings?.() ?? Promise.resolve(null),
      ]);
      setFlows(flowsRes.status === "fulfilled" ? (flowsRes.value?.flows ?? []) : []);
      if (smtpRes.status === "fulfilled" && smtpRes.value) {
        setSmtpConfigured(!!(smtpRes.value.host || smtpRes.value.smtp_host));
      }
    } catch (e) {
      setError(e?.message || "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { setNewNameErr("Flow adı gerekli"); return; }
    setSaving(true);
    try {
      const res = await client.createFlow?.({ name, trigger: newTrigger, status: "draft" });
      setFlows((prev) => [...prev, res?.flow ?? { id: Date.now(), name, trigger: newTrigger, status: "draft", step_count: 0 }]);
      setCreateOpen(false);
      setNewName("");
      setNewTrigger("abandoned_cart");
      setNewNameErr("");
    } catch (e) {
      setNewNameErr(e?.message || "Oluşturma hatası");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (flow) => {
    setTogglingId(flow.id);
    const nextStatus = flow.status === "active" ? "paused" : "active";
    try {
      await client.updateFlow?.(flow.id, { status: nextStatus });
      setFlows((prev) => prev.map((f) => f.id === flow.id ? { ...f, status: nextStatus } : f));
    } catch (e) {
      setError(e?.message || "Durum değiştirilemedi");
    } finally {
      setTogglingId("");
    }
  };

  const deleteFlow = async (id) => {
    setTogglingId(id);
    try {
      await client.deleteFlow?.(id);
      setFlows((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      setError(e?.message || "Silinemedi");
    } finally {
      setTogglingId("");
    }
  };

  return (
    <Page
      title="Flows"
      subtitle="Tetikleyici olaylara göre otomatik e-posta kampanyaları"
      primaryAction={{
        content: "Flow oluştur",
        onAction: () => { setNewName(""); setNewTrigger("abandoned_cart"); setNewNameErr(""); setCreateOpen(true); },
      }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>
          </Layout.Section>
        )}

        {smtpConfigured === false && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="E-posta sunucusu yapılandırılmamış"
              action={{ content: "SMTP ayarlarına git", url: "/apps/smtp" }}
            >
              Flow e-postalarının gönderilebilmesi için önce SMTP / Gmail ayarlarını yapmanız gerekiyor.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          {loading ? (
            <Card><Box padding="600"><InlineStack align="center"><Spinner /></InlineStack></Box></Card>
          ) : flows.length === 0 ? (
            <Card>
              <EmptyState
                heading="Henüz hiç flow yok"
                action={{ content: "İlk flow'u oluştur", onAction: () => setCreateOpen(true) }}
                image=""
              >
                <p>
                  Tetikleyici olaylar (terk edilen sepet, yeni sipariş, yeni abone vb.) bazında
                  otomatik e-posta dizileri oluşturun. Her flow; gecikme adımları ve kişiselleştirilmiş
                  e-posta şablonları içerebilir.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="300">
              {flows.map((flow) => {
                const badge = STATUS_BADGE[flow.status] ?? { tone: "default", label: flow.status };
                const isToggling = togglingId === flow.id;
                return (
                  <Card key={flow.id}>
                    <InlineStack align="space-between" blockAlign="center" wrap={false}>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h2" variant="headingSm">{flow.name}</Text>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Tetikleyici: {TRIGGER_LABELS[flow.trigger] ?? flow.trigger}
                          {flow.step_count != null && (
                            <> · {flow.step_count} adım</>
                          )}
                          {flow.sent_count != null && (
                            <> · {flow.sent_count.toLocaleString()} gönderim</>
                          )}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200" wrap={false}>
                        <Button
                          size="slim"
                          variant={flow.status === "active" ? "secondary" : "primary"}
                          loading={isToggling}
                          onClick={() => toggleStatus(flow)}
                        >
                          {flow.status === "active" ? "Duraklat" : "Etkinleştir"}
                        </Button>
                        <Button
                          size="slim"
                          tone="critical"
                          variant="plain"
                          disabled={isToggling}
                          onClick={() => deleteFlow(flow.id)}
                        >
                          Sil
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Flows nasıl çalışır?</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Bir flow; belirli bir müşteri eylemi (sipariş, sepet terki vb.) gerçekleştiğinde
                otomatik olarak başlar ve sıradaki adımları çalıştırır.
              </Text>
              <Divider />
              <Text as="p" variant="bodySm" tone="subdued">
                <strong>Tetikleyici →</strong> Flow'u başlatan olay.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                <strong>Adımlar →</strong> E-posta gönder, bekle (ör. 2 gün), koşul kontrol et.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                <strong>E-posta gönderimi</strong> için Apps &gt; SMTP sayfasından Gmail / Google
                Workspace hesabınızı bağlayın.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Flow"
        primaryAction={{ content: "Oluştur", onAction: handleCreate, loading: saving }}
        secondaryActions={[{ content: "İptal", onAction: () => setCreateOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Flow adı"
              value={newName}
              onChange={(v) => { setNewName(v); setNewNameErr(""); }}
              placeholder="ör. Terk Edilen Sepet Serisi"
              error={newNameErr}
              autoComplete="off"
            />
            <Select
              label="Tetikleyici"
              options={TRIGGER_OPTIONS}
              value={newTrigger}
              onChange={setNewTrigger}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
