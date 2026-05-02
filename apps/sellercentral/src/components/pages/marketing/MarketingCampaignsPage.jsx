"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Button,
  Banner,
  Badge,
  Modal,
  Spinner,
  EmptyState,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import CustomCheckbox from "@/components/ui/CustomCheckbox";

const PLATFORM_OPTIONS = [
  { value: "meta", label: "Meta (Facebook / Instagram)" },
  { value: "google_ads", label: "Google Ads" },
  { value: "tiktok", label: "TikTok Ads" },
  { value: "snapchat", label: "Snapchat Ads" },
];

const BID_OPTIONS = [
  { value: "cpc", label: "CPC – Cost per Click" },
  { value: "cpm", label: "CPM – Cost per 1000 Impressions" },
  { value: "target_roas", label: "Target ROAS" },
];

const TARGET_OPTIONS = [
  { value: "products", label: "Bestimmte Produkte" },
  { value: "groups", label: "Produktgruppen" },
  { value: "all", label: "Alle eigenen Produkte" },
];

const EMPTY_FORM = {
  name: "",
  description: "",
  target_type: "products",
  product_ids: [],
  group_ids: [],
  budget_daily_cents: "",
  bid_strategy: "cpc",
  ad_platforms: [],
  start_at: "",
  end_at: "",
  campaign_type: "ppc",
};

const fmtBudget = (cents) => {
  if (!cents) return "—";
  return `${(parseInt(cents) / 100).toFixed(2)} €/Tag`;
};

const fmtDate = (v) =>
  v ? new Date(v).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—";

const AD_STATUS_TONE = {
  draft: "info",
  pending_review: "warning",
  approved: "attention",
  published: "success",
  paused: "warning",
  rejected: "critical",
};

const AD_STATUS_LABEL = {
  draft: "Entwurf",
  pending_review: "Prüfung",
  approved: "Genehmigt",
  published: "Live",
  paused: "Pausiert",
  rejected: "Abgelehnt",
};

function CampaignRow({ campaign, isSuperuser, onEdit, onDelete, onPublish, onPause, onResume, actionLoading }) {
  const adStatus = campaign.ad_status || "draft";
  const platforms = Array.isArray(campaign.ad_platforms) ? campaign.ad_platforms : [];
  const budget = fmtBudget(campaign.budget_daily_cents);
  const platformLabels = platforms.map((p) => PLATFORM_OPTIONS.find((o) => o.value === p)?.label || p).join(", ");

  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "14px 0" }}>
      <InlineStack align="space-between" blockAlign="start" wrap={false}>
        <BlockStack gap="100" inlineSize="grow">
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text as="span" fontWeight="semibold">{campaign.name}</Text>
            <Badge tone={AD_STATUS_TONE[adStatus] || "info"}>{AD_STATUS_LABEL[adStatus] || adStatus}</Badge>
            {campaign.status === "active" && adStatus === "published" && (
              <Badge tone="success">Sponsored aktiv</Badge>
            )}
          </InlineStack>
          {campaign.description && (
            <Text tone="subdued" as="span" variant="bodySm">{campaign.description}</Text>
          )}
          <Text tone="subdued" as="span" variant="bodySm">
            Budget: {budget}
            {platformLabels ? ` · Plattformen: ${platformLabels}` : ""}
            {campaign.start_at || campaign.end_at ? ` · ${fmtDate(campaign.start_at)} – ${fmtDate(campaign.end_at)}` : ""}
          </Text>
        </BlockStack>
        <InlineStack gap="200" wrap>
          {isSuperuser && adStatus === "draft" && (
            <Button size="slim" tone="success" onClick={() => onPublish(campaign.id)} loading={actionLoading === campaign.id + "_publish"}>
              Veröffentlichen
            </Button>
          )}
          {isSuperuser && adStatus === "published" && (
            <Button size="slim" onClick={() => onPause(campaign.id)} loading={actionLoading === campaign.id + "_pause"}>
              Pausieren
            </Button>
          )}
          {isSuperuser && adStatus === "paused" && (
            <Button size="slim" tone="success" onClick={() => onResume(campaign.id)} loading={actionLoading === campaign.id + "_resume"}>
              Fortsetzen
            </Button>
          )}
          <Button size="slim" onClick={() => onEdit(campaign)}>Bearbeiten</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(campaign.id)}>Löschen</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

function toInputDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export default function MarketingCampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [msg, setMsg] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [productSearch, setProductSearch] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [sellerId, setSellerId] = useState(null);

  const client = getMedusaAdminClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
      setSellerId(localStorage.getItem("sellerId"));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, gRes, pRes] = await Promise.all([
        client.getCampaigns(),
        client.getProductGroups(),
        client.getAdminHubProducts({ limit: 500 }),
      ]);
      const allCampaigns = Array.isArray(cRes?.campaigns) ? cRes.campaigns : [];
      setCampaigns(allCampaigns.filter((c) => c.campaign_type === "ppc" || c.campaign_type == null && c.budget_daily_cents > 0));
      setGroups(Array.isArray(gRes?.groups) ? gRes.groups : []);
      setProducts(Array.isArray(pRes?.products) ? pRes.products : []);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Daten konnten nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConnectedPlatforms = useCallback(async () => {
    if (!isSuperuser) return;
    try {
      const d = await client.getMarketingAccounts();
      const active = (d?.accounts || []).filter((a) => a.is_active && Object.keys(a.credentials || {}).some((k) => a.credentials[k]));
      setConnectedPlatforms(active.map((a) => a.platform));
    } catch {}
  }, [isSuperuser]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadConnectedPlatforms(); }, [loadConnectedPlatforms]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, ad_platforms: connectedPlatforms });
    setProductSearch("");
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      description: c.description || "",
      target_type: c.target_type || "products",
      product_ids: Array.isArray(c.product_ids) ? [...c.product_ids] : [],
      group_ids: Array.isArray(c.group_ids) ? [...c.group_ids] : [],
      budget_daily_cents: c.budget_daily_cents ? String(Math.round(c.budget_daily_cents / 100)) : "",
      bid_strategy: c.bid_strategy || "cpc",
      ad_platforms: Array.isArray(c.ad_platforms) ? [...c.ad_platforms] : [],
      start_at: toInputDate(c.start_at),
      end_at: toInputDate(c.end_at),
      campaign_type: "ppc",
    });
    setProductSearch("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setProductSearch("");
  };

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const togglePlatform = (val) => {
    setForm((prev) => {
      const set = new Set(prev.ad_platforms);
      if (set.has(val)) set.delete(val); else set.add(val);
      return { ...prev, ad_platforms: Array.from(set) };
    });
  };

  const toggleProduct = (id) => {
    setForm((prev) => {
      const ids = new Set(prev.product_ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, product_ids: Array.from(ids) };
    });
  };

  const toggleGroup = (id) => {
    setForm((prev) => {
      const ids = new Set(prev.group_ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, group_ids: Array.from(ids) };
    });
  };

  const save = async () => {
    if (!form.name.trim()) {
      setMsg({ tone: "warning", text: "Bitte einen Kampagnennamen eingeben." });
      return;
    }
    const budgetEuro = parseFloat(form.budget_daily_cents);
    if (!form.budget_daily_cents || isNaN(budgetEuro) || budgetEuro <= 0) {
      setMsg({ tone: "warning", text: "Bitte ein gültiges Tagesbudget eingeben (z.B. 5 für 5 €/Tag)." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        target_type: form.target_type,
        product_ids: form.product_ids,
        group_ids: form.group_ids,
        budget_daily_cents: Math.round(budgetEuro * 100),
        bid_strategy: form.bid_strategy,
        ad_platforms: form.ad_platforms,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        campaign_type: "ppc",
        discount_type: "percentage",
        discount_value: 0,
        status: "draft",
      };
      if (editingId) {
        await client.updateCampaign(editingId, payload);
      } else {
        await client.createCampaign(payload);
      }
      setMsg({ tone: "success", text: editingId ? "Kampagne aktualisiert." : "Kampagne erstellt." });
      closeModal();
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Speichern." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Kampagne wirklich löschen?")) return;
    try {
      await client.deleteCampaign(id);
      setMsg({ tone: "success", text: "Kampagne gelöscht." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Löschen." });
    }
  };

  const handlePublish = async (id) => {
    setActionLoading(id + "_publish");
    setMsg(null);
    try {
      const r = await client.publishCampaign(id);
      const count = r?.platforms_published?.length || 0;
      const budgetPerPlatform = r?.budget_per_platform_cents ? `${(r.budget_per_platform_cents / 100).toFixed(2)} €` : "";
      setMsg({ tone: "success", text: `Kampagne auf ${count} Plattform(en) veröffentlicht.${budgetPerPlatform ? ` Budget je Plattform: ${budgetPerPlatform}/Tag.` : ""}` });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Veröffentlichen." });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id) => {
    setActionLoading(id + "_pause");
    try {
      await client.pauseCampaign(id);
      setMsg({ tone: "success", text: "Kampagne pausiert." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Pausieren." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (id) => {
    setActionLoading(id + "_resume");
    try {
      await client.resumeCampaign(id);
      setMsg({ tone: "success", text: "Kampagne fortgesetzt." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Fortsetzen." });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      !productSearch ||
      (p.title || "").toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.ean || "").includes(productSearch)
  );

  // Group campaigns by seller for superuser view
  const ownCampaigns = campaigns.filter((c) => c.seller_id === sellerId);
  const otherSellers = isSuperuser
    ? [...new Set(campaigns.filter((c) => c.seller_id !== sellerId).map((c) => c.seller_id))]
    : [];

  return (
    <Page
      title="Marketing-Kampagnen"
      subtitle="PPC-Werbekampagnen auf externen Plattformen"
      primaryAction={{ content: "Neue Kampagne", onAction: openCreate }}
    >
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        {isSuperuser && connectedPlatforms.length === 0 && (
          <Banner tone="warning">
            Keine Marketing-Konten verbunden. Gehe zu{" "}
            <strong>Apps & Integrationen</strong> um Werbekonten (Meta, Google Ads, etc.) zu verbinden.
          </Banner>
        )}

        {loading ? (
          <Card>
            <div style={{ padding: 32, textAlign: "center" }}>
              <Spinner size="small" />
            </div>
          </Card>
        ) : campaigns.length === 0 ? (
          <Card>
            <EmptyState heading="Keine PPC-Kampagnen" image="">
              <p>
                Erstelle eine Kampagne um deine Produkte auf Meta, Google Ads, TikTok oder Snapchat zu bewerben.
                Aktive Kampagnen erhalten außerdem einen <strong>Sponsored</strong>-Badge und algorithmischen Ranking-Boost im Shop.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <>
            {/* Own campaigns */}
            {ownCampaigns.length > 0 && (
              <Card>
                <BlockStack gap="0">
                  <Text as="h2" variant="headingMd">
                    {isSuperuser ? "Eigene Kampagnen" : "Meine Kampagnen"} ({ownCampaigns.length})
                  </Text>
                  {ownCampaigns.map((c) => (
                    <CampaignRow
                      key={c.id}
                      campaign={c}
                      isSuperuser={isSuperuser}
                      onEdit={openEdit}
                      onDelete={remove}
                      onPublish={handlePublish}
                      onPause={handlePause}
                      onResume={handleResume}
                      actionLoading={actionLoading}
                    />
                  ))}
                </BlockStack>
              </Card>
            )}

            {/* Other sellers' campaigns (superuser only) */}
            {isSuperuser &&
              otherSellers.map((sid) => {
                const sellerCamps = campaigns.filter((c) => c.seller_id === sid);
                if (!sellerCamps.length) return null;
                return (
                  <Card key={sid}>
                    <BlockStack gap="0">
                      <Text as="h2" variant="headingMd" tone="subdued">
                        Verkäufer: {sid} ({sellerCamps.length})
                      </Text>
                      {sellerCamps.map((c) => (
                        <CampaignRow
                          key={c.id}
                          campaign={c}
                          isSuperuser={isSuperuser}
                          onEdit={openEdit}
                          onDelete={remove}
                          onPublish={handlePublish}
                          onPause={handlePause}
                          onResume={handleResume}
                          actionLoading={actionLoading}
                        />
                      ))}
                    </BlockStack>
                  </Card>
                );
              })}
          </>
        )}
      </BlockStack>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Kampagne bearbeiten" : "Neue Kampagne erstellen"}
        primaryAction={{ content: "Speichern", onAction: save, loading: saving }}
        secondaryActions={[{ content: "Abbrechen", onAction: closeModal }]}
        large
      >
        {/* Basic */}
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">Kampagnendetails</Text>
            <TextField
              label="Kampagnenname *"
              value={form.name}
              onChange={(v) => setField("name", v)}
              autoComplete="off"
            />
            <TextField
              label="Beschreibung (intern)"
              value={form.description}
              onChange={(v) => setField("description", v)}
              multiline={2}
              autoComplete="off"
            />
            <InlineStack gap="300" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Tagesbudget (€) *"
                  type="number"
                  min="1"
                  step="0.5"
                  value={form.budget_daily_cents}
                  onChange={(v) => setField("budget_daily_cents", v)}
                  helpText="z.B. 5 für 5 €/Tag. Budget wird gleichmäßig auf ausgewählte Plattformen verteilt."
                  autoComplete="off"
                />
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label="Gebotsstrategie"
                  options={BID_OPTIONS}
                  value={form.bid_strategy}
                  onChange={(v) => setField("bid_strategy", v)}
                />
              </div>
            </InlineStack>
            <InlineStack gap="300" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Startdatum & -uhrzeit"
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(v) => setField("start_at", v)}
                  autoComplete="off"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Enddatum & -uhrzeit"
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(v) => setField("end_at", v)}
                  autoComplete="off"
                />
              </div>
            </InlineStack>
          </BlockStack>
        </Modal.Section>

        {/* Platforms */}
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Werbeplattformen</Text>
            <Text tone="subdued" as="p" variant="bodySm">
              Budget ({form.budget_daily_cents ? `${form.budget_daily_cents} €/Tag` : "—"}) wird gleichmäßig auf{" "}
              {form.ad_platforms.length || "keine"} ausgewählte Plattform(en) verteilt
              {form.ad_platforms.length > 0 && form.budget_daily_cents
                ? ` = ${(parseFloat(form.budget_daily_cents) / form.ad_platforms.length).toFixed(2)} €/Tag je Plattform`
                : ""}.
            </Text>
            <div style={{ border: "1px solid #e4e5e7", borderRadius: 8 }}>
              {PLATFORM_OPTIONS.map((p) => {
                const checked = form.ad_platforms.includes(p.value);
                const isConnected = connectedPlatforms.includes(p.value);
                return (
                  <label
                    key={p.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      cursor: "pointer",
                      background: checked ? "#f0f9ff" : "transparent",
                      borderBottom: "1px solid #f4f5f7",
                      opacity: !isConnected && isSuperuser ? 0.5 : 1,
                    }}
                  >
                    <CustomCheckbox checked={checked} onChange={() => togglePlatform(p.value)} size={18} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>{p.label}</span>
                      {isSuperuser && !isConnected && (
                        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>Nicht verbunden</span>
                      )}
                      {isSuperuser && isConnected && (
                        <span style={{ fontSize: 11, color: "#22c55e", marginLeft: 8 }}>Verbunden</span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </BlockStack>
        </Modal.Section>

        {/* Target */}
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">Beworbene Produkte</Text>
            <Select
              label="Zielauswahl"
              options={TARGET_OPTIONS}
              value={form.target_type}
              onChange={(v) => setField("target_type", v)}
            />

            {form.target_type === "products" && (
              <BlockStack gap="200">
                <Text as="span" variant="bodySm" tone="subdued">
                  {form.product_ids.length} Produkt(e) ausgewählt
                </Text>
                <TextField
                  label=""
                  labelHidden
                  placeholder="Produkte suchen …"
                  value={productSearch}
                  onChange={setProductSearch}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setProductSearch("")}
                />
                <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #e4e5e7", borderRadius: 8 }}>
                  {filteredProducts.map((p) => {
                    const checked = form.product_ids.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          cursor: "pointer",
                          background: checked ? "#f0f9ff" : "transparent",
                          borderBottom: "1px solid #f4f5f7",
                        }}
                      >
                        <CustomCheckbox checked={checked} onChange={() => toggleProduct(p.id)} size={18} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: checked ? 600 : 400,
                              color: "#202223",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.title || p.id}
                          </div>
                          {p.ean && <div style={{ fontSize: 11, color: "#6d7175" }}>EAN: {p.ean}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </BlockStack>
            )}

            {form.target_type === "groups" && (
              <BlockStack gap="200">
                <Text as="span" variant="bodySm" tone="subdued">
                  {form.group_ids.length} Gruppe(n) ausgewählt
                </Text>
                {groups.length === 0 ? (
                  <Banner tone="info">
                    Noch keine Produktgruppen erstellt. Erstelle zuerst Gruppen unter Produkte → Produktgruppen.
                  </Banner>
                ) : (
                  <div style={{ border: "1px solid #e4e5e7", borderRadius: 8 }}>
                    {groups.map((g) => {
                      const checked = form.group_ids.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            cursor: "pointer",
                            background: checked ? "#f0f9ff" : "transparent",
                            borderBottom: "1px solid #f4f5f7",
                          }}
                        >
                          <CustomCheckbox checked={checked} onChange={() => toggleGroup(g.id)} size={18} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: "#202223" }}>{g.name}</div>
                            <div style={{ fontSize: 11, color: "#6d7175" }}>{(g.product_ids || []).length} Produkte</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </BlockStack>
            )}

            {form.target_type === "all" && (
              <Banner tone="info">
                Die Kampagne bewirbt alle deine aktiven Produkte im Shop.
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
