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
import { useLocale } from "next-intl";
import { lt } from "@/lib/locale-text";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";
import { userError } from "@/lib/api-error-messages";

const fmtDate = (v, locale) => {
  if (!v) return "—";
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  return new Date(v).toLocaleDateString(loc);
};

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

function CouponRow({ c, onToggle, onRemove, onEdit, sellerLabel, ui, locale }) {
  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "12px 0" }}>
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">{c.code}</Text>
            <Badge tone={c.active ? "success" : "critical"}>{c.active ? ui.active : ui.inactive}</Badge>
          </InlineStack>
          <Text tone="subdued" as="span">
            {c.discount_type === "fixed" ? `${(Number(c.discount_value || 0) / 100).toFixed(2)} €` : `${c.discount_value}%`} |
            {lt(locale, "Min", "Min", "Min", "Min", "Min", "Min")}: {(Number(c.min_subtotal_cents || 0) / 100).toFixed(2)} € |
            {lt(locale, "Usage", "Kullanım", "Usage", "Usage", "Usage", "Nutzung")}: {Number(c.used_count || 0)}{c.usage_limit != null ? ` / ${c.usage_limit}` : ""} |
            {lt(locale, "Expires", "Bitiş", "Expires", "Expires", "Expires", "Ablauf")}: {fmtDate(c.expires_at, locale)}
          </Text>
          {sellerLabel ? (
            <Text tone="subdued" as="span" variant="bodySm">{lt(locale, "Seller", "Satıcı", "Seller", "Seller", "Seller", "Verkäufer")}: {sellerLabel}</Text>
          ) : null}
        </BlockStack>
        <InlineStack gap="200">
          <Button size="slim" onClick={() => onEdit(c)}>{ui.edit}</Button>
          <Button size="slim" onClick={() => onToggle(c)}>{c.active ? (lt(locale, "Deactivate", "Devre dışı bırak", "Deactivate", "Deactivate", "Deactivate", "Deaktivieren")) : (lt(locale, "Activate", "Etkinleştir", "Activate", "Activate", "Activate", "Aktivieren"))}</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onRemove(c.id)}>{ui.delete}</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

export default function CouponsPage() {
  const locale = useLocale();
  const ui = getUI(locale);

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
      setMsg({ tone: "critical", text: userError(e, locale, "Could not load coupons.") });
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
      setMsg({ tone: "warning", text: lt(locale, "Please enter a valid discount value.", "Lütfen geçerli bir indirim değeri girin.", "Please enter a valid discount value.", "Please enter a valid discount value.", "Please enter a valid discount value.", "Bitte einen gültigen Rabattwert eingeben.") });
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
      setMsg({ tone: "success", text: lt(locale, "Coupon created.", "Kupon oluşturuldu.", "Coupon created.", "Coupon created.", "Coupon created.", "Coupon erstellt.") });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: userError(e, locale, "Could not create coupon.") });
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
      setMsg({ tone: "warning", text: lt(locale, "Please enter a code.", "Lütfen bir kod girin.", "Please enter a code.", "Please enter a code.", "Please enter a code.", "Bitte einen Code eingeben.") });
      return;
    }
    const raw = Number(editForm.discount_value || 0);
    if (!Number.isFinite(raw) || raw <= 0) {
      setMsg({ tone: "warning", text: lt(locale, "Please enter a valid discount value.", "Lütfen geçerli bir indirim değeri girin.", "Please enter a valid discount value.", "Please enter a valid discount value.", "Please enter a valid discount value.", "Bitte einen gültigen Rabattwert eingeben.") });
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
      setMsg({ tone: "success", text: lt(locale, "Coupon updated.", "Kupon güncellendi.", "Coupon updated.", "Coupon updated.", "Coupon updated.", "Coupon aktualisiert.") });
      closeEdit();
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: userError(e, locale, "Could not update coupon.") });
    } finally {
      setEditSaving(false);
    }
  };

  const toggleActive = async (c) => {
    try {
      await getMedusaAdminClient().updateCoupon(c.id, { active: !c.active });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: userError(e, locale, "Could not change status.") });
    }
  };

  const remove = async (id) => {
    if (!(await confirmDelete(lt(locale, "Delete coupon?", "Kuponu sil?", "Delete coupon?", "Delete coupon?", "Delete coupon?", "Coupon löschen?")))) return;
    try {
      await getMedusaAdminClient().deleteCoupon(id);
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: userError(e, locale, "Could not delete coupon.") });
    }
  };

  const ownCoupons = isSuperuser ? coupons.filter((c) => !c.seller_id || c.seller_id === "default") : coupons;
  const sellerCoupons = isSuperuser ? coupons.filter((c) => c.seller_id && c.seller_id !== "default") : [];

  const sellerLabelFor = (c) => {
    if (!isSuperuser || !c.seller_id || c.seller_id === "default") return null;
    return sellerNameById[c.seller_id] || null;
  };

  const typeLabel = lt(locale, "Type", "Tür", "Type", "Type", "Type", "Typ");
  const percentLabel = lt(locale, "Percent", "Yüzde", "Percent", "Percent", "Percent", "Prozent");
  const fixedLabel = lt(locale, "Fixed (€)", "Sabit (€)", "Fixed (€)", "Fixed (€)", "Fixed (€)", "Fix (€)");
  const valuePercentLabel = lt(locale, "Value (%)", "Değer (%)", "Value (%)", "Value (%)", "Value (%)", "Wert (%)");
  const valueEuroLabel = lt(locale, "Value (€)", "Değer (€)", "Value (€)", "Value (€)", "Value (€)", "Wert (€)");
  const minOrderLabel = lt(locale, "Minimum order value (€)", "Minimum sipariş tutarı (€)", "Minimum order value (€)", "Minimum order value (€)", "Minimum order value (€)", "Mindestbestellwert (€)");
  const usageLimitLabel = lt(locale, "Usage limit (optional)", "Kullanım limiti (isteğe bağlı)", "Usage limit (optional)", "Usage limit (optional)", "Usage limit (optional)", "Nutzungslimit (optional)");
  const expiryLabel = lt(locale, "Expiry date (optional)", "Bitiş tarihi (isteğe bağlı)", "Expiry date (optional)", "Expiry date (optional)", "Expiry date (optional)", "Ablaufdatum (optional)");
  const createTitle = lt(locale, "Create coupon", "Kupon oluştur", "Create coupon", "Create coupon", "Create coupon", "Coupon erstellen");
  const editModalTitle = lt(locale, "Edit coupon", "Kuponu düzenle", "Edit coupon", "Edit coupon", "Edit coupon", "Coupon bearbeiten");

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
          title={editModalTitle}
          primaryAction={{ content: ui.save, onAction: saveEdit, loading: editSaving }}
          secondaryActions={[{ content: ui.cancel, onAction: closeEdit }]}
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
                label={typeLabel}
                options={[
                  { label: percentLabel, value: "percent" },
                  { label: fixedLabel, value: "fixed" },
                ]}
                value={editForm.discount_type}
                onChange={(v) => setEditForm((p) => ({ ...p, discount_type: v }))}
              />
              <TextField
                label={editForm.discount_type === "percent" ? valuePercentLabel : valueEuroLabel}
                type="number"
                min="0"
                max={editForm.discount_type === "percent" ? "100" : undefined}
                value={editForm.discount_value}
                onChange={(v) => setEditForm((p) => ({ ...p, discount_value: v }))}
                autoComplete="off"
              />
              <TextField
                label={minOrderLabel}
                type="number"
                min="0"
                value={editForm.min_subtotal_euros}
                onChange={(v) => setEditForm((p) => ({ ...p, min_subtotal_euros: v }))}
                autoComplete="off"
              />
              <TextField
                label={usageLimitLabel}
                type="number"
                min="0"
                value={editForm.usage_limit}
                onChange={(v) => setEditForm((p) => ({ ...p, usage_limit: v }))}
                autoComplete="off"
              />
              <TextField
                label={expiryLabel}
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
            <Text as="h2" variant="headingMd">{createTitle}</Text>
            <InlineStack gap="300" align="start">
              <TextField label="Code" value={form.code} onChange={(v) => setForm((p) => ({ ...p, code: v }))} autoComplete="off" />
              <Select
                label={typeLabel}
                options={[
                  { label: percentLabel, value: "percent" },
                  { label: fixedLabel, value: "fixed" },
                ]}
                value={form.discount_type}
                onChange={(v) => setForm((p) => ({ ...p, discount_type: v }))}
              />
              <TextField
                label={form.discount_type === "percent" ? valuePercentLabel : valueEuroLabel}
                type="number"
                min="0"
                max={form.discount_type === "percent" ? "100" : undefined}
                value={form.discount_value}
                onChange={(v) => setForm((p) => ({ ...p, discount_value: v }))}
                autoComplete="off"
              />
              <TextField
                label={minOrderLabel}
                type="number"
                min="0"
                value={form.min_subtotal_cents}
                onChange={(v) => setForm((p) => ({ ...p, min_subtotal_cents: v }))}
                autoComplete="off"
              />
              <TextField
                label={usageLimitLabel}
                type="number"
                min="0"
                value={form.usage_limit}
                onChange={(v) => setForm((p) => ({ ...p, usage_limit: v }))}
                autoComplete="off"
              />
              <TextField
                label={expiryLabel}
                type="date"
                value={form.expires_at}
                onChange={(v) => setForm((p) => ({ ...p, expires_at: v }))}
                autoComplete="off"
              />
            </InlineStack>
            <InlineStack>
              <Button variant="primary" onClick={submit} loading={saving} disabled={!form.code || !form.discount_value}>
                {lt(locale, "Save coupon", "Kuponu kaydet", "Save coupon", "Save coupon", "Save coupon", "Coupon speichern")}
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                {isSuperuser
                  ? lt(locale, `Own coupons (${ownCoupons.length})`, `Kendi kuponlarim (${ownCoupons.length})`, `Own coupons (${ownCoupons.length})`, `Own coupons (${ownCoupons.length})`, `Own coupons (${ownCoupons.length})`, `Eigene Coupons (${ownCoupons.length})`)
                  : `Coupons (${coupons.length})`}
              </Text>
              <Button onClick={load} loading={loading} size="slim">{ui.refresh}</Button>
            </InlineStack>
            {ownCoupons.length === 0 ? (
              <Text tone="subdued">{lt(locale, "No coupons yet.", "Henüz kupon yok.", "No coupons yet.", "No coupons yet.", "No coupons yet.", "Noch keine Coupons vorhanden.")}</Text>
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
                    ui={ui}
                    locale={locale}
                  />
                ))}
              </div>
            )}
          </BlockStack>
        </Card>

        {isSuperuser && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">{lt(locale, `Seller coupons (${sellerCoupons.length})`, `Satici kuponlari (${sellerCoupons.length})`, `Seller coupons (${sellerCoupons.length})`, `Seller coupons (${sellerCoupons.length})`, `Seller coupons (${sellerCoupons.length})`, `Verkaufer-Coupons (${sellerCoupons.length})`)}</Text>
              {sellerCoupons.length === 0 ? (
                <Text tone="subdued">{lt(locale, "No seller coupons.", "Satıcı kuponu yok.", "No seller coupons.", "No seller coupons.", "No seller coupons.", "Keine Verkäufer-Coupons vorhanden.")}</Text>
              ) : (
                <div>
                  {Object.entries(
                    sellerCoupons.reduce((groups, c) => {
                      const sid = c.seller_id || "unknown";
                      if (!groups[sid]) groups[sid] = [];
                      groups[sid].push(c);
                      return groups;
                    }, {})
                  ).map(([sid, sidCoupons]) => (
                    <div key={sid} style={{ borderTop: "1px solid #f1f2f4", paddingTop: 12, marginTop: 8 }}>
                      <div style={{ marginBottom: 4 }}>
                        <Text as="span" fontWeight="semibold">{sellerNameById[sid] || sid}</Text>
                        <Text as="span" tone="subdued"> ({sidCoupons.length})</Text>
                      </div>
                      {sidCoupons.map((c) => (
                        <CouponRow
                          key={c.id}
                          c={c}
                          onToggle={toggleActive}
                          onRemove={remove}
                          onEdit={openEdit}
                          sellerLabel={null}
                          ui={ui}
                          locale={locale}
                        />
                      ))}
                    </div>
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
