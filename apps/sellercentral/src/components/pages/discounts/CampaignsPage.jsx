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
  Divider,
  Spinner,
  EmptyState,
  Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import CustomCheckbox from "@/components/ui/CustomCheckbox";

const STATUS_OPTIONS = [
  { label: "Entwurf", value: "draft" },
  { label: "Aktiv", value: "active" },
  { label: "Pausiert", value: "paused" },
  { label: "Beendet", value: "ended" },
];

const DISCOUNT_TYPE_OPTIONS = [
  { label: "Prozent (%)", value: "percentage" },
  { label: "Fixer Betrag (€)", value: "fixed" },
];

const TARGET_TYPE_OPTIONS = [
  { label: "Bestimmte Produkte", value: "products" },
  { label: "Produktgruppen", value: "groups" },
  { label: "Alle eigenen Produkte", value: "all" },
];

const EMPTY_FORM = {
  name: "",
  description: "",
  status: "draft",
  start_at: "",
  end_at: "",
  discount_type: "percentage",
  discount_value: "",
  target_type: "products",
  product_ids: [],
  group_ids: [],
  settings: {
    show_badge: true,
    badge_text: "",
    min_order_value: "",
    max_uses: "",
    stackable: false,
  },
};

const fmtDate = (v) => (v ? new Date(v).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—");

const statusTone = { active: "success", draft: "info", paused: "warning", ended: "critical" };
const statusLabel = { active: "Aktiv", draft: "Entwurf", paused: "Pausiert", ended: "Beendet" };

function CampaignCard({ campaign, groups, products, onEdit, onDelete }) {
  const targetDesc = campaign.target_type === "all"
    ? "Alle Produkte"
    : campaign.target_type === "groups"
      ? `${(campaign.group_ids || []).length} Gruppe(n)`
      : `${(campaign.product_ids || []).length} Produkt(e)`;

  const discountLabel = campaign.discount_type === "percentage"
    ? `${campaign.discount_value}%`
    : `${Number(campaign.discount_value || 0).toFixed(2)} €`;

  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "14px 0" }}>
      <InlineStack align="space-between" blockAlign="start">
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">{campaign.name}</Text>
            <Badge tone={statusTone[campaign.status] || "info"}>
              {statusLabel[campaign.status] || campaign.status}
            </Badge>
            <Badge tone="warning">{discountLabel} Rabatt</Badge>
          </InlineStack>
          {campaign.description && (
            <Text tone="subdued" as="span" variant="bodySm">{campaign.description}</Text>
          )}
          <Text tone="subdued" as="span" variant="bodySm">
            {fmtDate(campaign.start_at)} — {fmtDate(campaign.end_at)} · {targetDesc}
          </Text>
        </BlockStack>
        <InlineStack gap="200">
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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [productSearch, setProductSearch] = useState("");

  const client = getMedusaAdminClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, gRes, pRes] = await Promise.all([
        client.getCampaigns(),
        client.getProductGroups(),
        client.getAdminHubProducts({ limit: 500 }),
      ]);
      setCampaigns(Array.isArray(cRes?.campaigns) ? cRes.campaigns : []);
      setGroups(Array.isArray(gRes?.groups) ? gRes.groups : []);
      setProducts(Array.isArray(pRes?.products) ? pRes.products : []);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Daten konnten nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setProductSearch("");
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      description: c.description || "",
      status: c.status || "draft",
      start_at: toInputDate(c.start_at),
      end_at: toInputDate(c.end_at),
      discount_type: c.discount_type || "percentage",
      discount_value: String(c.discount_value || ""),
      target_type: c.target_type || "products",
      product_ids: Array.isArray(c.product_ids) ? [...c.product_ids] : [],
      group_ids: Array.isArray(c.group_ids) ? [...c.group_ids] : [],
      settings: {
        show_badge: c.settings?.show_badge !== false,
        badge_text: c.settings?.badge_text || "",
        min_order_value: c.settings?.min_order_value != null ? String(c.settings.min_order_value) : "",
        max_uses: c.settings?.max_uses != null ? String(c.settings.max_uses) : "",
        stackable: !!c.settings?.stackable,
      },
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
  const setSetting = (key, value) => setForm((p) => ({ ...p, settings: { ...p.settings, [key]: value } }));

  const save = async () => {
    if (!form.name.trim()) {
      setMsg({ tone: "warning", text: "Bitte einen Kampagnennamen eingeben." });
      return;
    }
    if (!form.discount_value || isNaN(Number(form.discount_value)) || Number(form.discount_value) <= 0) {
      setMsg({ tone: "warning", text: "Bitte einen gültigen Rabattwert eingeben." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        ...form,
        discount_value: Number(form.discount_value),
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        settings: {
          ...form.settings,
          min_order_value: form.settings.min_order_value !== "" ? Number(form.settings.min_order_value) : null,
          max_uses: form.settings.max_uses !== "" ? Number(form.settings.max_uses) : null,
        },
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

  const filteredProducts = products.filter((p) =>
    !productSearch ||
    (p.title || "").toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.ean || "").includes(productSearch)
  );

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const otherCampaigns = campaigns.filter((c) => c.status !== "active");

  return (
    <Page
      title="Aktionen & Kampagnen"
      primaryAction={{ content: "Neue Kampagne", onAction: openCreate }}
    >
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        {loading ? (
          <Card><div style={{ padding: 32, textAlign: "center" }}><Spinner size="small" /></div></Card>
        ) : campaigns.length === 0 ? (
          <Card>
            <EmptyState heading="Keine Kampagnen" image="">
              <p>Erstelle Kampagnen um Rabatte auf deine Produkte im Shop anzuzeigen.</p>
            </EmptyState>
          </Card>
        ) : (
          <>
            {activeCampaigns.length > 0 && (
              <Card>
                <BlockStack gap="0">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Aktive Kampagnen ({activeCampaigns.length})</Text>
                    <Button size="slim" onClick={load} loading={loading}>Aktualisieren</Button>
                  </InlineStack>
                  {activeCampaigns.map((c) => (
                    <CampaignCard key={c.id} campaign={c} groups={groups} products={products} onEdit={openEdit} onDelete={remove} />
                  ))}
                </BlockStack>
              </Card>
            )}
            {otherCampaigns.length > 0 && (
              <Card>
                <BlockStack gap="0">
                  <Text as="h2" variant="headingMd">Weitere Kampagnen ({otherCampaigns.length})</Text>
                  {otherCampaigns.map((c) => (
                    <CampaignCard key={c.id} campaign={c} groups={groups} products={products} onEdit={openEdit} onDelete={remove} />
                  ))}
                </BlockStack>
              </Card>
            )}
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
        {/* Basic Info */}
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">Grundeinstellungen</Text>
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
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={form.status}
                  onChange={(v) => setField("status", v)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label="Rabatttyp"
                  options={DISCOUNT_TYPE_OPTIONS}
                  value={form.discount_type}
                  onChange={(v) => setField("discount_type", v)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label={form.discount_type === "percentage" ? "Rabatt (%)" : "Rabatt (€)"}
                  type="number"
                  min="0"
                  max={form.discount_type === "percentage" ? "100" : undefined}
                  value={form.discount_value}
                  onChange={(v) => setField("discount_value", v)}
                  autoComplete="off"
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

        {/* Target */}
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">Zielprodukte</Text>
            <Select
              label="Zieltyp"
              options={TARGET_TYPE_OPTIONS}
              value={form.target_type}
              onChange={(v) => setField("target_type", v)}
            />

            {form.target_type === "products" && (
              <BlockStack gap="200">
                <Text as="span" variant="bodySm" tone="subdued">{form.product_ids.length} Produkt(e) ausgewählt</Text>
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
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", background: checked ? "#f0f9ff" : "transparent", borderBottom: "1px solid #f4f5f7" }}>
                        <CustomCheckbox checked={checked} onChange={() => toggleProduct(p.id)} size={18} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: "#202223", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || p.id}</div>
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
                <Text as="span" variant="bodySm" tone="subdued">{form.group_ids.length} Gruppe(n) ausgewählt</Text>
                {groups.length === 0 ? (
                  <Banner tone="info">Noch keine Produktgruppen erstellt. Erstelle zuerst Gruppen unter Produkte → Produktgruppen.</Banner>
                ) : (
                  <div style={{ border: "1px solid #e4e5e7", borderRadius: 8 }}>
                    {groups.map((g) => {
                      const checked = form.group_ids.includes(g.id);
                      return (
                        <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", background: checked ? "#f0f9ff" : "transparent", borderBottom: "1px solid #f4f5f7" }}>
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
              <Banner tone="info">Der Rabatt wird auf alle deine aktiven Produkte im Shop angewendet.</Banner>
            )}
          </BlockStack>
        </Modal.Section>

        {/* Advanced Settings */}
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">Weitere Einstellungen</Text>
            <InlineStack gap="300" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Mindestbestellwert (€, optional)"
                  type="number"
                  min="0"
                  value={form.settings.min_order_value}
                  onChange={(v) => setSetting("min_order_value", v)}
                  autoComplete="off"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Max. Nutzungen (optional)"
                  type="number"
                  min="0"
                  value={form.settings.max_uses}
                  onChange={(v) => setSetting("max_uses", v)}
                  autoComplete="off"
                  helpText="Wie oft die Kampagne insgesamt genutzt werden darf."
                />
              </div>
            </InlineStack>
            <Checkbox
              label="Rabattbadge im Shop anzeigen"
              checked={form.settings.show_badge}
              onChange={(v) => setSetting("show_badge", v)}
            />
            {form.settings.show_badge && (
              <TextField
                label='Badge-Text (z.B. "Aktion", "−20%")'
                value={form.settings.badge_text}
                onChange={(v) => setSetting("badge_text", v)}
                autoComplete="off"
                placeholder={form.discount_type === "percentage" ? `−${form.discount_value || "?"}%` : "Aktion"}
              />
            )}
            <Checkbox
              label="Mit anderen Aktionen kombinierbar"
              checked={form.settings.stackable}
              onChange={(v) => setSetting("stackable", v)}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
