"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, Banner, BlockStack, Box, Button, Card, InlineStack, Modal,
  Spinner, Tabs, Text, TextField,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";
import {
  APP_STORE_CATEGORIES,
  appDescription,
  appDisplayName,
  appPricingLabel,
  getAppStoreCopy,
} from "@/lib/app-store-i18n";

const client = getMedusaAdminClient();

function maskKey(val) {
  const s = String(val || "");
  if (!s) return "";
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}${"•".repeat(Math.min(16, s.length - 8))}${s.slice(-4)}`;
}

function parseManifest(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return typeof raw === "object" ? raw : {};
}

export default function AppStoreHub({ selectedTab, onTabChange, highlightHandle, onFindStoreConsumed }) {
  const locale = useLocale();
  const router = useRouter();
  const copy = useMemo(() => getAppStoreCopy(locale), [locale]);
  const [apps, setApps] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [loadingStore, setLoadingStore] = useState(true);
  const [loadingInstalled, setLoadingInstalled] = useState(true);
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [installing, setInstalling] = useState(null);
  const [uninstalling, setUninstalling] = useState(null);
  const [msg, setMsg] = useState(null);
  const [detail, setDetail] = useState(null);
  const [configureInst, setConfigureInst] = useState(null);
  const [cfg, setCfg] = useState({ api_url: "", api_key: "", api_secret: "" });
  const [savingCfg, setSavingCfg] = useState(false);

  const tabs = [
    { id: "store", content: copy.tabStore, panelID: "app-store-panel" },
    { id: "installed", content: copy.tabInstalled, panelID: "installed-apps-panel" },
  ];
  const tabIndex = selectedTab === "installed" ? 1 : 0;

  const loadStore = useCallback(async () => {
    setLoadingStore(true);
    try {
      const params = new URLSearchParams();
      if (category && category !== "all") params.set("category", category);
      if (q.trim()) params.set("q", q.trim());
      const data = await client.request(`/admin-hub/v1/app-store/apps?${params}`);
      setApps(data?.apps || []);
    } catch {
      setApps([]);
    } finally {
      setLoadingStore(false);
    }
  }, [category, q]);

  const loadInstalled = useCallback(async () => {
    setLoadingInstalled(true);
    try {
      const data = await client.request("/admin-hub/v1/app-store/installations");
      setInstallations(data?.installations || []);
    } catch {
      setInstallations([]);
    } finally {
      setLoadingInstalled(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadStore, 250);
    return () => clearTimeout(t);
  }, [loadStore]);

  useEffect(() => {
    loadInstalled();
  }, [loadInstalled]);

  useEffect(() => {
    if (!highlightHandle || !apps.length) return;
    const found = apps.find((a) => a.handle === highlightHandle);
    if (found) {
      setDetail(found);
      onFindStoreConsumed?.();
    }
  }, [highlightHandle, apps]);

  const openConfigure = (inst) => {
    const settings = inst.settings || {};
    setCfg({
      api_url: settings.api_url || "",
      api_key: settings.api_key || "",
      api_secret: "",
    });
    setConfigureInst(inst);
  };

  const handleInstall = async (app) => {
    const handle = app.handle;
    setInstalling(handle);
    setMsg(null);
    try {
      const data = await client.request(`/admin-hub/v1/app-store/apps/${encodeURIComponent(handle)}/install`, { method: "POST" });
      await Promise.all([loadStore(), loadInstalled()]);
      setDetail(null);
      onTabChange?.("installed");
      setMsg({ tone: "success", text: copy.installOk });
      if (data?.authorize_url) {
        window.location.href = data.authorize_url;
        return;
      }
      const inst = (await client.request("/admin-hub/v1/app-store/installations"))?.installations?.find((i) => i.handle === handle);
      if (inst) openConfigure(inst);
    } catch (e) {
      if (e?.statusCode === 402 || e?.body?.needs_card) {
        setMsg({ tone: "warning", text: copy.needsCard, billing: true });
      } else {
        setMsg({ tone: "critical", text: e?.message || copy.installFail });
      }
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (inst) => {
    const name = appDisplayName(inst);
    if (!(await confirmDelete(copy.uninstallConfirm(name)))) return;
    setUninstalling(inst.id);
    try {
      await client.request(`/admin-hub/v1/app-store/installations/${encodeURIComponent(inst.id)}`, { method: "DELETE" });
      await Promise.all([loadStore(), loadInstalled()]);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || copy.installFail });
    } finally {
      setUninstalling(null);
    }
  };

  const saveConfigure = async () => {
    if (!configureInst) return;
    setSavingCfg(true);
    try {
      const patch = {
        api_url: cfg.api_url.trim(),
        api_key: cfg.api_key.trim(),
        connected: true,
      };
      if (cfg.api_secret.trim()) patch.api_secret = cfg.api_secret.trim();
      await client.request(`/admin-hub/v1/app-store/installations/${encodeURIComponent(configureInst.id)}/settings`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setConfigureInst(null);
      setMsg({ tone: "success", text: copy.connectionSaved });
      await loadInstalled();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || copy.installFail });
    } finally {
      setSavingCfg(false);
    }
  };

  const goConnect = (inst) => {
    if (inst.authorize_url) {
      window.location.href = inst.authorize_url;
      return;
    }
    if (inst.configure_url) {
      window.open(inst.configure_url, "_blank", "noopener,noreferrer");
    }
    openConfigure(inst);
  };

  const renderAppCard = (app) => {
    const manifest = parseManifest(app.manifest);
    const name = appDisplayName({ ...app, manifest });
    const desc = appDescription(manifest, locale);
    const installed = !!app.installed;
    return (
      <div
        key={app.id || app.handle}
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 160,
        }}
      >
        <InlineStack align="space-between" blockAlign="start" wrap={false} gap="200">
          <Text as="h3" variant="headingSm">{name}</Text>
          <Badge tone={installed ? "success" : "info"}>
            {installed ? copy.added : appPricingLabel(manifest, copy)}
          </Badge>
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued">
          {copy.byDeveloper(app.developer_name || "—")}
        </Text>
        {desc ? (
          <Text as="p" variant="bodySm">{desc.length > 140 ? `${desc.slice(0, 140)}…` : desc}</Text>
        ) : null}
        <div style={{ marginTop: "auto" }}>
          <InlineStack gap="200">
            <Button size="slim" onClick={() => setDetail({ ...app, manifest })}>{copy.details}</Button>
            {installed ? (
              <Button size="slim" onClick={() => onTabChange?.("installed")}>{copy.configure}</Button>
            ) : (
              <Button size="slim" variant="primary" loading={installing === app.handle} onClick={() => handleInstall(app)}>
                {copy.add}
              </Button>
            )}
          </InlineStack>
        </div>
      </div>
    );
  };

  const renderInstalledCard = (inst) => {
    const manifest = parseManifest(inst.manifest);
    const name = appDisplayName({ ...inst, manifest });
    const connected = !!inst.connected;
    const apiKey = inst.api_key || inst.settings?.api_key || inst.client_id || "";
    return (
      <div
        key={inst.id}
        style={{
          background: "#fff",
          border: `1px solid ${connected ? "#d1fae5" : "#e5e7eb"}`,
          borderRadius: 10,
          padding: 16,
        }}
      >
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="start" wrap>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">{name}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {copy.byDeveloper(inst.developer_name || "—")} · {inst.handle}
              </Text>
            </BlockStack>
            <Badge tone={connected ? "success" : "critical"}>
              {connected ? copy.connectionOk : copy.connectionFail}
            </Badge>
          </InlineStack>
          {apiKey ? (
            <div style={{ padding: "8px 12px", background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#6b7280", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
              <span style={{ fontWeight: 600, color: "#374151" }}>{copy.apiKey}</span>
              <span style={{ fontFamily: "ui-monospace, monospace" }}>{maskKey(apiKey)}</span>
              {inst.client_id && inst.client_id !== apiKey ? (
                <>
                  <span style={{ fontWeight: 600, color: "#374151" }}>{copy.clientId}</span>
                  <span style={{ fontFamily: "ui-monospace, monospace" }}>{maskKey(inst.client_id)}</span>
                </>
              ) : null}
            </div>
          ) : null}
          <InlineStack gap="200">
            <Button size="slim" variant={connected ? "secondary" : "primary"} onClick={() => goConnect(inst)}>
              {connected ? copy.configure : copy.connect}
            </Button>
            <Button size="slim" tone="critical" loading={uninstalling === inst.id} onClick={() => handleUninstall(inst)}>
              {copy.uninstall}
            </Button>
          </InlineStack>
        </BlockStack>
      </div>
    );
  };

  const detailManifest = parseManifest(detail?.manifest);

  return (
    <BlockStack gap="400">
      <Tabs
        tabs={tabs}
        selected={tabIndex}
        onSelect={(i) => onTabChange?.(i === 1 ? "installed" : "store")}
      >
        <Box paddingBlockStart="400">
          {msg && (
            <Box paddingBlockEnd="400">
              <Banner
                tone={msg.tone}
                onDismiss={() => setMsg(null)}
                action={msg.billing ? { content: copy.goBilling, onAction: () => router.push("/settings/billing") } : undefined}
              >
                {msg.text}
              </Banner>
            </Box>
          )}

          {tabIndex === 0 ? (
            <BlockStack gap="400">
              <InlineStack gap="200" wrap>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <TextField
                    label=""
                    labelHidden
                    value={q}
                    onChange={setQ}
                    placeholder={copy.searchPlaceholder}
                    autoComplete="off"
                    connectedRight={<Button onClick={loadStore}>{copy.search}</Button>}
                  />
                </div>
              </InlineStack>
              <InlineStack gap="100" wrap>
                {APP_STORE_CATEGORIES.map((c) => (
                  <Button key={c} size="slim" pressed={category === c} onClick={() => setCategory(c)}>
                    {copy.categories[c] || c}
                  </Button>
                ))}
              </InlineStack>
              {loadingStore ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
              ) : apps.length === 0 ? (
                <Card>
                  <Box padding="400">
                    <Text as="p" tone="subdued">{copy.emptyStore}</Text>
                  </Box>
                </Card>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                  {apps.map(renderAppCard)}
                </div>
              )}
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              {loadingInstalled ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
              ) : installations.length === 0 ? (
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300" inlineAlign="start">
                      <Text as="p" tone="subdued">{copy.emptyInstalled}</Text>
                      <Button onClick={() => onTabChange?.("store")}>{copy.browseStore}</Button>
                    </BlockStack>
                  </Box>
                </Card>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {installations.map(renderInstalledCard)}
                </div>
              )}
            </BlockStack>
          )}
        </Box>
      </Tabs>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? appDisplayName({ ...detail, manifest: detailManifest }) : ""}
        primaryAction={
          detail?.installed
            ? { content: copy.configure, onAction: () => { setDetail(null); onTabChange?.("installed"); } }
            : { content: copy.add, loading: installing === detail?.handle, onAction: () => handleInstall(detail) }
        }
        secondaryActions={[{ content: copy.close, onAction: () => setDetail(null) }]}
      >
        <Modal.Section>
          {detail ? (
            <BlockStack gap="300">
              <InlineStack gap="200">
                <Badge>{detail.type === "shop_app" ? copy.shopApp : copy.integrationApp}</Badge>
                <Badge>{appPricingLabel(detailManifest, copy)}</Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                {copy.byDeveloper(detail.developer_name || "—")} · {copy.installs(detail.install_count ?? 0)}
              </Text>
              {appDescription(detailManifest, locale) ? (
                <Text as="p">{appDescription(detailManifest, locale)}</Text>
              ) : null}
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>

      <Modal
        open={!!configureInst}
        onClose={() => setConfigureInst(null)}
        title={copy.configureTitle}
        primaryAction={{ content: copy.saveConnection, onAction: saveConfigure, loading: savingCfg }}
        secondaryActions={[
          ...(configureInst?.authorize_url || configureInst?.configure_url
            ? [{
                content: copy.connectExternal,
                onAction: () => {
                  const url = configureInst.authorize_url || configureInst.configure_url;
                  if (configureInst.authorize_url) window.location.href = url;
                  else window.open(url, "_blank", "noopener,noreferrer");
                },
              }]
            : []),
          { content: copy.close, onAction: () => setConfigureInst(null) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">{copy.configureHelp}</Text>
            <TextField label={copy.apiUrl} value={cfg.api_url} onChange={(v) => setCfg((s) => ({ ...s, api_url: v }))} autoComplete="off" placeholder="https://" />
            <TextField label={copy.apiKey} value={cfg.api_key} onChange={(v) => setCfg((s) => ({ ...s, api_key: v }))} autoComplete="off" />
            <TextField label={copy.apiSecret} value={cfg.api_secret} onChange={(v) => setCfg((s) => ({ ...s, api_secret: v }))} type="password" autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

export function useInstalledApps() {
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.request("/admin-hub/v1/app-store/installations");
      setInstallations(data?.installations || []);
    } catch {
      setInstallations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { installations, loading, reload };
}
