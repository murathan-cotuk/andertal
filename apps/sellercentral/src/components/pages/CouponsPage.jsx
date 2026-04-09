"use client";

import { useEffect, useState } from "react";
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
  Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("de-DE") : "—");

function CouponRow({ c, onToggle, onRemove }) {
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
          {c.seller_id && c.seller_id !== "default" && (
            <Text tone="subdued" as="span" variant="bodySm">Verkäufer-ID: {c.seller_id}</Text>
          )}
        </BlockStack>
        <InlineStack gap="200">
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

  const submit = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await getMedusaAdminClient().createCoupon({
        code: form.code,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value || 0),
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

  // Split coupons for superuser view
  const ownCoupons = isSuperuser ? coupons.filter((c) => !c.seller_id || c.seller_id === "default") : coupons;
  const sellerCoupons = isSuperuser ? coupons.filter((c) => c.seller_id && c.seller_id !== "default") : [];

  return (
    <Page title="Coupons">
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

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
                  <CouponRow key={c.id} c={c} onToggle={toggleActive} onRemove={remove} />
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
                    <CouponRow key={c.id} c={c} onToggle={toggleActive} onRemove={remove} />
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
