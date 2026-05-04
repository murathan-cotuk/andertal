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
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("de-DE") : "—");

function toDateInput(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function CouponRow({ c, onToggle, onRemove, onEdit, sellerLabel }) {
  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "12px 0" }}>
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">{c.code}</Text>
            <Badge tone={c.active ? "success" : "critical"}>{c.active ? "Aktiv" : "Inaktiv"}</Badge>
          </InlineStack>
          <Text tone="subdued" as="span">
            {c.discount_type === "fixed" ? `${(Number(c.discount_value || 0) / 100).toFixed(2)} €` : `${c.discount_value}%`} |
            Min: {(Number(c.min_subtotal_cents || 0) / 100).toFixed(2)} € |
            Nutzung: {Number(c.used_count || 0)}{c.usage_limit != null ? ` / ${c.usage_limit}` : ""} |
            Ablauf: {fmtDate(c.expires_at)}
          </Text>
          {sellerLabel ? (
            <Text tone="subdued" as="span" variant="bodySm">Verkäufer: {sellerLabel}</Text>
          ) : null}
        </BlockStack>
        <InlineStack gap="200">
          <Button size="slim" onClick={() => onEdit(c)}>Bearbeiten</Button>
          <Button size="slim" onClick={() => onToggle(c)}>{c.active ? "Deaktivieren" : "Aktivieren"}</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onRemove(c.id)}>Löschen</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [sellerNameById, setSellerNameById] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: "",
    min_subtotal_euros: "",
    usage_limit: "",
    expires_at: "",
  });
  const [form, setForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: "",
    min_subtotal_cents: "",
    usage_limit: "",
    expires_at: "",
  });

  useEffect(() => {
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const loadSellerNames = useCallback(async () => {
    if (localStorage.getItem("sellerIsSuperuser") !== "true") return;
    try {
      const res = await getMedusaAdminClient().getSellers({ limit: 500 });
      const list = Array.isArray(res?.sellers) ? res.sellers : [];
      const m = {};
      for (const s of list) {
        const sid = String(s.seller_id || "").trim();
        if (!sid) continue;
        const label =
          String(s.store_name || "").trim()
          || String(s.company_name || "").trim()
          || [s.first_name, s.last_name].filter(Boolean).join(" ").trim()
          || String(s.email || "").trim();
        if (label) m[sid] = label;
      }
      setSellerNameById(m);
    } catch {
      setSellerNameById({});
    }
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMedusaAdminClient().getCoupons();
      setCoupons(Array.isArray(res?.coupons) ? res.coupons : []);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Coupons konnten nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (isSuperuser) loadSellerNames();
  }, [isSuperuser, loadSellerNames]);

  const discountValueForCreateApi = () => {
    const raw = Number(form.discount_value || 0);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    if (form.discount_type === "fixed") return Math.round(raw * 100);
    return Math.min(100, Math.round(raw));
  };

  const submit = async () => {
    const dVal = discountValueForCreateApi();
    if (dVal == null || dVal <= 0) {
      setMsg({ tone: "warning", text: "Bitte einen gültigen Rabattwert eingeben." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await getMedusaAdminClient().createCoupon({
        code: form.code,
        discount_type: form.discount_type,
        discount_value: dVal,
        min_subtotal_cents: Math.round(Number(form.min_subtotal_cents || 0) * 100),
        usage_limit: form.usage_limit === "" ? null : Number(form.usage_limit),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      });
      setForm({ code: "", discount_type: "percent", discount_value: "", min_subtotal_cents: "", usage_limit: "", expires_at: "" });
      setMsg({ tone: "success", text: "Coupon erstellt." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Coupon konnte nicht erstellt werden." });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    const isFixed = String(c.discount_type || "").toLowerCase() === "fixed";
    setEditForm({
      code: c.code || "",
      discount_type: isFixed ? "fixed" : "percent",
      discount_value: isFixed
        ? String((Number(c.discount_value || 0) / 100).toFixed(2))
        : String(c.discount_value ?? ""),
      min_subtotal_euros: String((Number(c.min_subtotal_cents || 0) / 100).toFixed(2)),
      usage_limit: c.usage_limit != null ? String(c.usage_limit) : "",
      expires_at: toDateInput(c.expires_at),
    });
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingId(null);
    setEditForm({
      code: "",
      discount_type: "percent",
      discount_value: "",
      min_subtotal_euros: "",
      usage_limit: "",
      expires_at: "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const code = editForm.code.trim();
    if (!code) {
      setMsg({ tone: "warning", text: "Bitte einen Code eingeben." });
      return;
    }
    const raw = Number(editForm.discount_value || 0);
    if (!Number.isFinite(raw) || raw <= 0) {
      setMsg({ tone: "warning", text: "Bitte einen gültigen Rabattwert eingeben." });
      return;
    }
    const discountValue =
      editForm.discount_type === "fixed" ? Math.round(raw * 100) : Math.min(100, Math.round(raw));

    setEditSaving(true);
    setMsg(null);
    try {
      await getMedusaAdminClient().updateCoupon(editingId, {
        code,
        discount_type: editForm.discount_type,
        discount_value: discountValue,
        min_subtotal_cents: Math.round(Number(editForm.min_subtotal_euros || 0) * 100),
        usage_limit: editForm.usage_limit === "" ? null : Number(editForm.usage_limit),
        expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null,
      });
      setMsg({ tone: "success", text: "Coupon aktualisiert." });
      closeEdit();
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Coupon konnte nicht aktualisiert werden." });
    } finally {
      setEditSaving(false);
    }
  };

  const toggleActive = async (c) => {
    try {
      await getMedusaAdminClient().updateCoupon(c.id, { active: !c.active });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Status konnte nicht geändert werden." });
    }
  };

  const remove = async (id) => {
    if (!confirm("Coupon löschen?")) return;
    try {
      await getMedusaAdminClient().deleteCoupon(id);
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Coupon konnte nicht gelöscht werden." });
    }
  };

  const ownCoupons = isSuperuser ? coupons.filter((c) => !c.seller_id || c.seller_id === "default") : coupons;
  const sellerCoupons = isSuperuser ? coupons.filter((c) => c.seller_id && c.seller_id !== "default") : [];

  const sellerLabelFor = (c) => {
    if (!isSuperuser || !c.seller_id || c.seller_id === "default") return null;
    return sellerNameById[c.seller_id] || null;
  };

  return (
    <Page title="Coupons">
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        <Modal
          open={editOpen}
          onClose={closeEdit}
          title="Coupon bearbeiten"
          primaryAction={{ content: "Speichern", onAction: saveEdit, loading: editSaving }}
          secondaryActions={[{ content: "Abbrechen", onAction: closeEdit }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <TextField
                label="Code"
                value={editForm.code}
                onChange={(v) => setEditForm((p) => ({ ...p, code: v }))}
                autoComplete="off"
              />
              <Select
                label="Typ"
                options={[
                  { label: "Prozent", value: "percent" },
                  { label: "Fix (€)", value: "fixed" },
                ]}
                value={editForm.discount_type}
                onChange={(v) => setEditForm((p) => ({ ...p, discount_type: v }))}
              />
              <TextField
                label={editForm.discount_type === "percent" ? "Wert (%)" : "Wert (€)"}
                type="number"
                min="0"
                max={editForm.discount_type === "percent" ? "100" : undefined}
                value={editForm.discount_value}
                onChange={(v) => setEditForm((p) => ({ ...p, discount_value: v }))}
                autoComplete="off"
              />
              <TextField
                label="Mindestbestellwert (€)"
                type="number"
                min="0"
                value={editForm.min_subtotal_euros}
                onChange={(v) => setEditForm((p) => ({ ...p, min_subtotal_euros: v }))}
                autoComplete="off"
              />
              <TextField
                label="Nutzungslimit (optional)"
                type="number"
                min="0"
                value={editForm.usage_limit}
                onChange={(v) => setEditForm((p) => ({ ...p, usage_limit: v }))}
                autoComplete="off"
              />
              <TextField
                label="Ablaufdatum (optional)"
                type="date"
                value={editForm.expires_at}
                onChange={(v) => setEditForm((p) => ({ ...p, expires_at: v }))}
                autoComplete="off"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Coupon erstellen</Text>
            <InlineStack gap="300" align="start">
              <TextField label="Code" value={form.code} onChange={(v) => setForm((p) => ({ ...p, code: v }))} autoComplete="off" />
              <Select
                label="Typ"
                options={[
                  { label: "Prozent", value: "percent" },
                  { label: "Fix (€)", value: "fixed" },
                ]}
                value={form.discount_type}
                onChange={(v) => setForm((p) => ({ ...p, discount_type: v }))}
              />
              <TextField
                label={form.discount_type === "percent" ? "Wert (%)" : "Wert (€)"}
                type="number"
                min="0"
                max={form.discount_type === "percent" ? "100" : undefined}
                value={form.discount_value}
                onChange={(v) => setForm((p) => ({ ...p, discount_value: v }))}
                autoComplete="off"
              />
              <TextField
                label="Mindestbestellwert (€)"
                type="number"
                min="0"
                value={form.min_subtotal_cents}
                onChange={(v) => setForm((p) => ({ ...p, min_subtotal_cents: v }))}
                autoComplete="off"
              />
              <TextField
                label="Usage limit (optional)"
                type="number"
                min="0"
                value={form.usage_limit}
                onChange={(v) => setForm((p) => ({ ...p, usage_limit: v }))}
                autoComplete="off"
              />
              <TextField
                label="Ablaufdatum (optional)"
                type="date"
                value={form.expires_at}
                onChange={(v) => setForm((p) => ({ ...p, expires_at: v }))}
                autoComplete="off"
              />
            </InlineStack>
            <InlineStack>
              <Button variant="primary" onClick={submit} loading={saving} disabled={!form.code || !form.discount_value}>
                Coupon speichern
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                {isSuperuser ? `Eigene Coupons (${ownCoupons.length})` : `Coupons (${coupons.length})`}
              </Text>
              <Button onClick={load} loading={loading} size="slim">Aktualisieren</Button>
            </InlineStack>
            {ownCoupons.length === 0 ? (
              <Text tone="subdued">Noch keine Coupons vorhanden.</Text>
            ) : (
              <div>
                {ownCoupons.map((c) => (
                  <CouponRow
                    key={c.id}
                    c={c}
                    onToggle={toggleActive}
                    onRemove={remove}
                    onEdit={openEdit}
                    sellerLabel={sellerLabelFor(c)}
                  />
                ))}
              </div>
            )}
          </BlockStack>
        </Card>

        {isSuperuser && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Verkäufer-Coupons ({sellerCoupons.length})</Text>
              {sellerCoupons.length === 0 ? (
                <Text tone="subdued">Keine Verkäufer-Coupons vorhanden.</Text>
              ) : (
                <div>
                  {sellerCoupons.map((c) => (
                    <CouponRow
                      key={c.id}
                      c={c}
                      onToggle={toggleActive}
                      onRemove={remove}
                      onEdit={openEdit}
                      sellerLabel={sellerLabelFor(c)}
                    />
                  ))}
                </div>
              )}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
