"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Select,
  Divider,
  Banner,
  Badge,
  Box,
  InlineGrid,
  Checkbox,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";
import { useUI } from "@/lib/ui-strings";
import { getShippingCopy } from "@/lib/shipping-i18n";
import { getCountryList } from "@/lib/countries";
import { dateLocaleFor, lt } from "@/lib/locale-text";
import { NumericTextField } from "@/components/NumericTextField";

function normalizeSellerCountryCode(code) {
  const u = String(code ?? "").trim().toUpperCase();
  if (u === "UK") return "GB";
  return /^[A-Z]{2}$/.test(u) ? u : "";
}

/* ── Country multi-select ────────────────────────────────────── */
const COUNTRY_PICKER_STYLES = `
.cp-checkbox-container { cursor: pointer; flex-shrink: 0; }
.cp-checkbox-container input { display: none; }
.cp-checkbox-path {
  fill: none; stroke: #8c9196; stroke-width: 6;
  stroke-linecap: round; stroke-linejoin: round;
  transition: stroke-dasharray 0.35s ease, stroke-dashoffset 0.35s ease, stroke 0.2s;
  stroke-dasharray: 241 9999999; stroke-dashoffset: 0;
}
.cp-checkbox-container input:checked ~ svg .cp-checkbox-path {
  stroke: #008060; stroke-dasharray: 70.5 9999999; stroke-dashoffset: -262.27;
}
.cp-item { display:flex; align-items:center; gap:10px; padding:9px 14px; cursor:pointer; border:none; background:none; width:100%; text-align:left; font-size:13px; color:#202223; }
.cp-item:hover { background:#f6f6f7; }
`;

function CountryPicker({ selected, onChange, countries, copy }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const inputWrapRef = useRef(null);

  const openPanel = () => {
    if (inputWrapRef.current) {
      const rect = inputWrapRef.current.getBoundingClientRect();
      const dropdownHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      setPanelStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 340),
        zIndex: 10002,
      });
      if (spaceBelow < dropdownHeight) {
        setTimeout(() => window.scrollBy({ top: dropdownHeight - spaceBelow + 16, behavior: "smooth" }), 0);
      }
    }
    setOpen(true);
  };

  const toggle = (code) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };
  const remove = (code) => onChange(selected.filter((c) => c !== code));

  const filtered = countries.filter(
    (c) => c.label.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <style>{COUNTRY_PICKER_STYLES}</style>
      <div style={{ position: "relative" }}>
        <div
          ref={inputWrapRef}
          style={{ border: "1px solid #8c9196", borderRadius: 4, padding: "6px 10px", background: "#fff", cursor: "text", minHeight: 36 }}
          onClick={openPanel}
        >
          <input
            style={{ border: "none", outline: "none", width: "100%", fontSize: 13, background: "transparent", color: "#202223" }}
            placeholder={copy.searchCountry}
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (!open) openPanel(); }}
            onFocus={openPanel}
          />
        </div>

        {open && typeof document !== "undefined" && createPortal(
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 10001 }}
              onClick={() => { setOpen(false); setSearch(""); }}
            />
            <div style={{
              ...panelStyle,
              background: "#fff", border: "1px solid #c9cccf", borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)", maxHeight: 360, overflowY: "auto",
            }}>
              {filtered.slice(0, 80).map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className="cp-item"
                  onClick={() => toggle(c.code)}
                >
                  <span className="cp-checkbox-container" style={{ pointerEvents: "none" }}>
                    <input type="checkbox" checked={selected.includes(c.code)} readOnly tabIndex={-1} />
                    <svg viewBox="0 0 64 64" height="1.15em" width="1.15em">
                      <path d="M 0 16 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 16 L 32 48 L 64 16 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 16" pathLength="575.0541381835938" className="cp-checkbox-path" />
                    </svg>
                  </span>
                  <span style={{ fontWeight: 600, color: "#6d7175", minWidth: 28, fontSize: 11 }}>{c.code}</span>
                  <span>{c.label}</span>
                </button>
              ))}
              {filtered.length > 80 && (
                <div style={{ padding: "6px 14px", fontSize: 12, color: "#6d7175", borderTop: "1px solid #f1f1f1" }}>
                  {copy.moreCountries(filtered.length - 80)}
                </div>
              )}
            </div>
          </>,
          document.body
        )}

        {selected.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {selected.map((code) => {
              const country = countries.find((c) => c.code === code);
              return (
                <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "var(--p-color-bg-fill-secondary, #f3f4f6)", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, color: "#374151" }}>
                  <span style={{ fontWeight: 600, color: "#6d7175", fontSize: 11 }}>{code}</span>
                  {country?.label}
                  <button type="button" onClick={() => remove(code)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "#9ca3af", marginLeft: 2 }}>×</button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Shipping groups section ─────────────────────────────────── */
const EMPTY_GROUP_FORM = { name: "", carrier_id: "", selectedCountries: [], prices: {} };

function ShippingGroupsSection({ carriers, countries, copy, ui, locale }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_GROUP_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMedusaAdminClient().request("/admin-hub/v1/shipping-groups");
      setGroups(data?.groups || []);
    } catch (_) { setGroups([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const openCreate = () => {
    setForm(EMPTY_GROUP_FORM);
    setEditingId(null);
    setErr("");
    setShowForm(true);
  };

  const openEdit = (g) => {
    const selectedCountries = (g.prices || []).filter(p => p.price_cents > 0).map(p => p.country_code);
    const prices = {};
    for (const p of (g.prices || [])) {
      if (p.price_cents > 0) prices[p.country_code] = String(p.price_cents / 100);
    }
    setForm({ name: g.name || "", carrier_id: g.carrier_id || "", selectedCountries, prices });
    setEditingId(g.id);
    setErr("");
    setShowForm(true);
  };

  const handleCountriesChange = (codes) => {
    setForm((f) => {
      const newPrices = { ...f.prices };
      // Remove prices for deselected countries
      for (const k of Object.keys(newPrices)) {
        if (!codes.includes(k)) delete newPrices[k];
      }
      return { ...f, selectedCountries: codes, prices: newPrices };
    });
  };

  const handleSave = async () => {
    if (!form.name) { setErr(copy.groupNameRequired); return; }
    setSaving(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const pricesPayload = [];
      for (const rawCode of form.selectedCountries) {
        const code = normalizeSellerCountryCode(rawCode);
        if (!code) continue;
        const rawVal = form.prices[rawCode] ?? form.prices[code] ?? "0";
        pricesPayload.push({
          country_code: code,
          price_cents: Math.round(Number(String(rawVal).replace(",", ".")) * 100) || 0,
        });
      }
      if (editingId) {
        await client.request(`/admin-hub/v1/shipping-groups/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: form.name, carrier_id: form.carrier_id || null, prices: pricesPayload }),
        });
      } else {
        await client.request("/admin-hub/v1/shipping-groups", {
          method: "POST",
          body: JSON.stringify({ name: form.name, carrier_id: form.carrier_id || null, prices: pricesPayload }),
        });
      }
      await loadGroups();
      setShowForm(false);
      setEditingId(null);
    } catch (e) { setErr(e?.message || copy.saveError); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!(await confirmDelete(copy.deleteGroupConfirm))) return;
    try {
      await getMedusaAdminClient().request(`/admin-hub/v1/shipping-groups/${id}`, { method: "DELETE" });
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch (_) {}
  };

  const carrierOptions = [
    { label: copy.noCarrier, value: "" },
    ...carriers.map((c) => ({ label: c.name, value: c.id })),
  ];
  const moneyLocale = dateLocaleFor(locale);

  return (
    <BlockStack gap="400">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BlockStack gap="100">
          <Text variant="headingMd" as="h2">{copy.groupsTitle}</Text>
          <Text variant="bodySm" tone="subdued">{copy.groupsSub}</Text>
        </BlockStack>
        <Button onClick={openCreate}>{copy.newGroup}</Button>
      </div>

      {loading && <Text tone="subdued">{ui.loading}</Text>}

      {!loading && groups.length === 0 && !showForm && (
        <Box padding="600" background="bg-surface-secondary" borderRadius="200">
          <Text alignment="center" tone="subdued">{copy.noGroups}</Text>
        </Box>
      )}

      {groups.length > 0 && (
        <Card padding="0">
          {groups.map((g, i) => (
            <div key={g.id}>
              {i > 0 && <Divider />}
              <div style={{ padding: "14px 20px" }}>
                <InlineStack align="space-between" blockAlign="start" gap="400">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">{g.name}</Text>
                    {g.carrier_name && <Text variant="bodySm" tone="subdued">{copy.carrierLabel}: {g.carrier_name}</Text>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                      {(g.prices || []).filter(p => p.price_cents > 0).map((p) => {
                        const country = countries.find((c) => c.code === p.country_code);
                        return (
                          <span key={p.country_code} style={{ fontSize: 11, background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 8px", color: "#374151" }}>
                            {country?.label || p.country_code}: {(p.price_cents / 100).toLocaleString(moneyLocale, { minimumFractionDigits: 2 })} €
                          </span>
                        );
                      })}
                    </div>
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button size="slim" onClick={() => openEdit(g)}>{ui.edit}</Button>
                    <Button size="slim" tone="critical" onClick={() => handleDelete(g.id)}>{ui.delete}</Button>
                  </InlineStack>
                </InlineStack>
              </div>
            </div>
          ))}
        </Card>
      )}

      {showForm && (
        <Card>
          <BlockStack gap="400">
            <Text variant="headingSm" as="h3">{editingId ? copy.editGroup : copy.newGroupForm}</Text>
            <InlineGrid columns={2} gap="400">
              <TextField
                label={copy.groupName}
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder={copy.groupNamePlaceholder}
                autoComplete="off"
              />
              <Select
                label={copy.carrierLabel}
                options={carrierOptions}
                value={form.carrier_id}
                onChange={(v) => setForm((f) => ({ ...f, carrier_id: v }))}
              />
            </InlineGrid>

            <BlockStack gap="200">
              <Text variant="bodySm" fontWeight="semibold">{copy.selectCountries}</Text>
              <CountryPicker
                selected={form.selectedCountries}
                onChange={handleCountriesChange}
                countries={countries}
                copy={copy}
              />
            </BlockStack>

            {form.selectedCountries.length > 0 && (
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="semibold">{copy.shippingPrices}</Text>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                  {form.selectedCountries.map((code, i) => {
                    const country = countries.find((c) => c.code === code);
                    return (
                      <div key={code} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: i < form.selectedCountries.length - 1 ? "1px solid #f3f4f6" : "none", background: "#fff" }}>
                        <span style={{ minWidth: 160, fontSize: 13, color: "#374151" }}>
                          <span style={{ fontWeight: 600, color: "#6d7175", fontSize: 11, marginRight: 6 }}>{code}</span>
                          {country?.label || code}
                        </span>
                        <div style={{ flex: 1, maxWidth: 160 }}>
                          <TextField
                            value={form.prices[code] || ""}
                            onChange={(v) => setForm((f) => ({ ...f, prices: { ...f.prices, [code]: v } }))}
                            placeholder="0.00"
                            suffix="€"
                            autoComplete="off"
                          />
                        </div>
                        <button
                          onClick={() => handleCountriesChange(form.selectedCountries.filter(c => c !== code))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
                          title={copy.removeCountry}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </BlockStack>
            )}

            {err && <Banner tone="critical"><p>{err}</p></Banner>}
            <InlineStack gap="200">
              <Button onClick={() => { setShowForm(false); setEditingId(null); }}>{ui.cancel}</Button>
              <Button variant="primary" onClick={handleSave} loading={saving}>{ui.save}</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}

/* ── Carrier modal ───────────────────────────────────────────── */
const EMPTY_CARRIER_FORM = { name: "", tracking_url_template: "", api_key: "", api_secret: "", is_active: true };

function CarrierModal({ mode, carrier, onClose, onSaved, copy, ui }) {
  const [form, setForm] = useState(
    carrier
      ? { name: carrier.name || "", tracking_url_template: carrier.tracking_url_template || "", api_key: carrier.api_key || "", api_secret: carrier.api_secret || "", is_active: carrier.is_active !== false }
      : EMPTY_CARRIER_FORM
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!form.name) { setErr(copy.nameRequired); return; }
    setSaving(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const res = mode === "edit"
        ? await client.updateCarrier(carrier.id, form)
        : await client.createCarrier(form);
      onSaved(res.carrier, mode);
      onClose();
    } catch (e) { setErr(e?.message || copy.genericError); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="headingMd" as="h3">{mode === "edit" ? copy.editCarrier : copy.addCarrier}</Text>
          <Button variant="plain" onClick={onClose}>✕</Button>
        </div>
        <div style={{ padding: 20 }}>
          <BlockStack gap="400">
            <TextField label={ui.colName} value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="DHL" autoComplete="off" />
            <TextField
              label={<>{copy.trackingUrl} <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>({copy.trackingHelp})</span></>}
              value={form.tracking_url_template}
              onChange={(v) => setForm((f) => ({ ...f, tracking_url_template: v }))}
              placeholder="https://carrier.com/track/{tracking}"
              autoComplete="off"
            />
            <TextField label={<>{copy.apiKey} <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>({copy.optional})</span></>} value={form.api_key} onChange={(v) => setForm((f) => ({ ...f, api_key: v }))} type="password" autoComplete="off" />
            <TextField label={<>{copy.apiSecret} <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>({copy.optional})</span></>} value={form.api_secret} onChange={(v) => setForm((f) => ({ ...f, api_secret: v }))} type="password" autoComplete="off" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              {copy.active}
            </label>
            {err && <Banner tone="critical"><p>{err}</p></Banner>}
          </BlockStack>
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb" }}>
          <InlineStack gap="200" align="end">
            <Button onClick={onClose}>{ui.cancel}</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>{ui.save}</Button>
          </InlineStack>
        </div>
      </div>
    </div>
  );
}

/* ── Country overview (superuser only) ─────────────────────────
   Every country that appears in ANY seller's shipping-group prices (the same set the shop's
   top-right country selector shows, since it reads from /store/shipping-groups), with how many
   published products currently route through a shipping group that includes it, and a per-country
   on/off switch. Switching a country off strips it out of /store/shipping-groups server-side, so
   it disappears from the shop selector and becomes unbuyable — no product data changes. */
function CountryToggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 999, border: "none", padding: 2,
        background: checked ? "#008060" : "#d1d5db", cursor: disabled ? "default" : "pointer",
        display: "inline-flex", alignItems: "center", transition: "background 0.15s", flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transform: checked ? "translateX(18px)" : "translateX(0)",
        transition: "transform 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

function CountryOverviewSection({ locale, copy }) {
  const [countries, setCountries] = useState(null); // null = loading
  const [err, setErr] = useState("");
  const [pending, setPending] = useState({}); // country_code -> true while PATCH in flight
  const countryNames = useMemo(() => getCountryList(locale), [locale]);

  const load = useCallback(() => {
    getMedusaAdminClient()
      .request("/admin-hub/v1/country-overview")
      .then((d) => setCountries(Array.isArray(d?.countries) ? d.countries : []))
      .catch((e) => setErr(e?.message || copy.countryOverviewLoadError))
    ;
  }, [copy.countryOverviewLoadError]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (countryCode, nextEnabled) => {
    setPending((p) => ({ ...p, [countryCode]: true }));
    setCountries((list) => (list || []).map((c) => c.country_code === countryCode ? { ...c, is_enabled: nextEnabled } : c));
    try {
      await getMedusaAdminClient().request(`/admin-hub/v1/country-overview/${countryCode}`, {
        method: "PATCH",
        body: JSON.stringify({ is_enabled: nextEnabled }),
      });
    } catch (e) {
      setErr(e?.message || copy.countryOverviewSaveError);
      setCountries((list) => (list || []).map((c) => c.country_code === countryCode ? { ...c, is_enabled: !nextEnabled } : c));
    }
    setPending((p) => { const n = { ...p }; delete n[countryCode]; return n; });
  };

  if (countries === null) return null;

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text variant="headingSm" as="h3">{copy.countryOverviewTitle}</Text>
          <Text variant="bodySm" tone="subdued">{copy.countryOverviewSub}</Text>
        </BlockStack>

        {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}

        {countries.length === 0 ? (
          <Text tone="subdued">{copy.countryOverviewEmpty}</Text>
        ) : (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            {countries.map((c, i) => {
              const name = countryNames.find((n) => n.code === c.country_code)?.label || c.country_code;
              return (
                <div
                  key={c.country_code}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                    borderBottom: i < countries.length - 1 ? "1px solid #f3f4f6" : "none",
                    background: "#fff", opacity: c.is_enabled ? 1 : 0.6,
                  }}
                >
                  <span style={{ minWidth: 200, fontSize: 13, color: "#374151" }}>
                    <span style={{ fontWeight: 600, color: "#6d7175", fontSize: 11, marginRight: 6 }}>{c.country_code}</span>
                    {name}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: "#6d7175" }}>
                    {copy.countryOverviewProductCount(c.product_count)}
                  </span>
                  <CountryToggle
                    checked={c.is_enabled}
                    disabled={!!pending[c.country_code]}
                    onChange={(next) => toggle(c.country_code, next)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </BlockStack>
    </Card>
  );
}

/* ── Sendcloud Config Section (superuser only) ───────────────── */
function SendcloudSection({ copy, ui }) {
  const [cfg, setCfg] = useState({ public_key: "", secret_key: "", markup_pct: 5, is_active: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | { ok, message }
  const [err, setErr] = useState("");

  useEffect(() => {
    getMedusaAdminClient().getSendcloudIntegration()
      .then((d) => {
        if (d?.configured || d?.public_key) {
          setCfg({
            public_key: d.public_key || "",
            secret_key: d.secret_key || "",
            markup_pct: d.markup_pct ?? 5,
            is_active: d.is_active !== false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setErr("");
    try {
      const r = await getMedusaAdminClient().testSendcloudIntegration({
        public_key: cfg.public_key.trim(),
        secret_key: cfg.secret_key.trim(),
      });
      setTestResult({ ok: true, message: copy.connected(r.company) });
    } catch (e) {
      setTestResult({ ok: false, message: e?.message || copy.connectionFailed });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    if (!cfg.public_key.trim() || !cfg.secret_key.trim()) { setErr(copy.keysRequired); return; }
    setSaving(true); setErr(""); setSaved(false);
    try {
      await getMedusaAdminClient().saveSendcloudIntegration({
        public_key: cfg.public_key.trim(),
        secret_key: cfg.secret_key.trim(),
        markup_pct: Number(cfg.markup_pct) || 5,
        is_active: cfg.is_active,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e?.message || copy.saveError);
    }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "#003087", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>SC</div>
              <Text variant="headingSm" as="h3">{copy.sendcloudTitle}</Text>
            </InlineStack>
            <Text variant="bodySm" tone="subdued">{copy.sendcloudSub}</Text>
          </BlockStack>
          <InlineStack gap="200" blockAlign="center">
            {saved && <Badge tone="success">{copy.saved}</Badge>}
            <Badge tone={cfg.is_active ? "success" : undefined}>{cfg.is_active ? copy.active : copy.inactive}</Badge>
          </InlineStack>
        </InlineStack>

        <Divider />

        <InlineGrid columns={2} gap="300">
          <TextField
            label={copy.publicKey}
            value={cfg.public_key}
            onChange={(v) => { setCfg((c) => ({ ...c, public_key: v })); setTestResult(null); }}
            placeholder="sc-api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autoComplete="off"
            monospaced
          />
          <TextField
            label={copy.secretKey}
            type={showSecret ? "text" : "password"}
            value={cfg.secret_key}
            onChange={(v) => { setCfg((c) => ({ ...c, secret_key: v })); setTestResult(null); }}
            placeholder="••••••••••••••••"
            autoComplete="off"
            monospaced
            suffix={
              <Button variant="plain" size="slim" onClick={() => setShowSecret((s) => !s)}>
                {showSecret ? copy.hide : copy.show}
              </Button>
            }
          />
        </InlineGrid>

        <InlineGrid columns={2} gap="300">
          <TextField
            label={copy.markup}
            type="number"
            value={String(cfg.markup_pct)}
            onChange={(v) => setCfg((c) => ({ ...c, markup_pct: v }))}
            suffix="%"
            helpText={copy.markupHelp}
            min="0"
            max="50"
            autoComplete="off"
          />
          <div style={{ paddingTop: 24 }}>
            <Button onClick={() => setCfg((c) => ({ ...c, is_active: !c.is_active }))}>
              {cfg.is_active ? copy.deactivate : copy.activate}
            </Button>
          </div>
        </InlineGrid>

        {testResult && (
          <Banner tone={testResult.ok ? "success" : "critical"} onDismiss={() => setTestResult(null)}>
            {testResult.message}
          </Banner>
        )}
        {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}

        <InlineStack gap="300">
          <Button onClick={handleTest} loading={testing} disabled={!cfg.public_key.trim() || !cfg.secret_key.trim()}>
            {copy.testConnection}
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {ui.save}
          </Button>
        </InlineStack>

        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
          <BlockStack gap="100">
            <Text variant="bodySm" fontWeight="semibold" tone="subdued">{copy.webhookTitle}</Text>
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "#374151", background: "#f3f4f6", padding: "8px 12px", borderRadius: 6, userSelect: "all" }}>
              https://api.andertal.com/webhook/sendcloud
            </div>
            <Text variant="bodySm" tone="subdued">{copy.webhookHelp}</Text>
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
}

/* ── Main page ───────────────────────────────────────────────── */
const PRESET_CARRIERS = [
  { name: "DHL", tracking_url_template: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={tracking}" },
  { name: "DPD", tracking_url_template: "https://tracking.dpd.de/parcelstatus?query={tracking}" },
  { name: "GLS", tracking_url_template: "https://gls-group.com/track/{tracking}" },
  { name: "UPS", tracking_url_template: "https://www.ups.com/track?tracknum={tracking}" },
  { name: "FedEx", tracking_url_template: "https://www.fedex.com/fedextrack/?trknbr={tracking}" },
  { name: "Hermes", tracking_url_template: "https://www.myhermes.de/empfangen/sendungsverfolgung/#/{tracking}" },
  { name: "Go! Express", tracking_url_template: "" },
  { name: "USPS", tracking_url_template: "https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking}" },
];

/** Platform free-shipping thresholds live on `seller_id === 'default'` (same row the storefront reads). */

export default function ShippingSettingsPage() {
  const locale = useLocale();
  const ui = useUI();
  const copy = getShippingCopy(locale);
  const countries = useMemo(() => getCountryList(locale), [locale]);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [currentStoreName, setCurrentStoreName] = useState("");
  const [thresholds, setThresholds] = useState({});
  const [thresholdCountries, setThresholdCountries] = useState([]);
  const [addCountrySelect, setAddCountrySelect] = useState("");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [savedThreshold, setSavedThreshold] = useState(false);
  const [thresholdErr, setThresholdErr] = useState("");
  const [scannerConfig, setScannerConfig] = useState({ enabled: true, auto_focus: true, auto_submit: true, min_length: 3 });
  const [savingScanner, setSavingScanner] = useState(false);
  const [savedScanner, setSavedScanner] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const loadSuperuser =
      typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    const [carriersData, settings, platformSettings] = await Promise.all([
      getMedusaAdminClient().getCarriers(),
      getMedusaAdminClient().getSellerSettings().catch(() => ({})),
      loadSuperuser ? getMedusaAdminClient().getSellerSettings("default").catch(() => ({})) : Promise.resolve({}),
    ]);
    setCarriers(carriersData.carriers || []);
    setCurrentStoreName(settings?.store_name || "");
    if (settings?.barcode_scanner_config && typeof settings.barcode_scanner_config === "object") {
      setScannerConfig((prev) => ({ ...prev, ...settings.barcode_scanner_config }));
    }
    const thresholdData = loadSuperuser ? platformSettings?.free_shipping_thresholds : null;
    if (thresholdData && typeof thresholdData === "object") {
      const display = {};
      const codes = [];
      for (const [code, cents] of Object.entries(thresholdData)) {
        const iso = normalizeSellerCountryCode(code);
        if (!iso) continue;
        if (!codes.includes(iso)) codes.push(iso);
        display[iso] = String(Number(cents) / 100);
      }
      setThresholdCountries(codes);
      setThresholds(display);
    } else if (loadSuperuser) {
      setThresholdCountries([]);
      setThresholds({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveThresholds = async () => {
    const thresholdCents = {};
    for (const code of thresholdCountries) {
      const iso = normalizeSellerCountryCode(code);
      if (!iso) continue;
      const raw = (thresholds[code] || "").replace(",", ".");
      const cents = Math.round(parseFloat(raw) * 100);
      if (!isNaN(cents) && cents >= 0) thresholdCents[iso] = cents;
    }
    setSavingThreshold(true); setThresholdErr("");
    try {
      await getMedusaAdminClient().updateSellerSettings({
        seller_id: "default",
        free_shipping_thresholds: thresholdCents,
      });
      setSavedThreshold(true);
      setTimeout(() => setSavedThreshold(false), 3000);
    } catch (e) {
      setThresholdErr(e?.message || copy.saveError);
    }
    setSavingThreshold(false);
  };

  const handleSaveScannerConfig = async (next) => {
    setSavingScanner(true);
    try {
      await getMedusaAdminClient().updateSellerSettings({ barcode_scanner_config: next });
      setScannerConfig(next);
      setSavedScanner(true);
      setTimeout(() => setSavedScanner(false), 3000);
    } catch (_) { /* ignore */ }
    setSavingScanner(false);
  };

  const handleCarrierSaved = (carrier, mode) => {
    if (mode === "edit") {
      setCarriers((prev) => prev.map((c) => (c.id === carrier?.id ? { ...c, ...carrier } : c)));
    } else {
      if (carrier) setCarriers((prev) => [...prev, carrier]);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDelete(copy.deleteCarrierConfirm))) return;
    await getMedusaAdminClient().deleteCarrier(id);
    setCarriers((prev) => prev.filter((c) => c.id !== id));
  };

  const handleToggle = async (c) => {
    await getMedusaAdminClient().updateCarrier(c.id, { is_active: !c.is_active });
    setCarriers((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
  };

  const getModalCarrier = () => {
    if (!modal) return null;
    if (modal.mode === "edit") return modal.carrier;
    if (modal.preset) return { ...EMPTY_CARRIER_FORM, name: modal.preset.name, tracking_url_template: modal.preset.tracking_url_template };
    return null;
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <BlockStack gap="600">
        <div>
          <Text variant="headingLg" as="h1">{copy.pageTitle}</Text>
        </div>

        <ShippingGroupsSection carriers={carriers} countries={countries} copy={copy} ui={ui} locale={locale} />

        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">
                {lt(locale, "Barcode Scanner", "Barkod Tarayıcı", "Scanner de codes-barres", "Escáner de códigos de barras", "Scanner di codici a barre", "Barcode-Scanner")}
              </Text>
              <Text tone="subdued" as="p">
                {lt(
                  locale,
                  "Most USB barcode scanners act as a keyboard — no driver needed. These settings control how the scan field on the /shipping packing screen behaves.",
                  "Çoğu USB barkod tarayıcı klavye gibi çalışır — sürücü gerekmez. Bu ayarlar /shipping paketleme ekranındaki tarama kutusunun davranışını belirler.",
                  "La plupart des scanners USB fonctionnent comme un clavier — aucun pilote requis. Ces réglages contrôlent le champ de scan sur l'écran /shipping.",
                  "La mayoría de escáneres USB funcionan como un teclado — no requieren driver. Estos ajustes controlan el campo de escaneo en /shipping.",
                  "La maggior parte degli scanner USB funziona come una tastiera — nessun driver necessario. Queste impostazioni controllano il campo di scansione in /shipping.",
                  "Die meisten USB-Barcode-Scanner verhalten sich wie eine Tastatur — kein Treiber nötig. Diese Einstellungen steuern das Scan-Feld auf der /shipping-Packseite.",
                )}
              </Text>
            </BlockStack>

            {savedScanner && <Banner tone="success">{ui.saved}</Banner>}

            <Checkbox
              label={lt(locale, "Enabled", "Etkin", "Activé", "Activado", "Attivo", "Aktiviert")}
              checked={scannerConfig.enabled !== false}
              onChange={(v) => handleSaveScannerConfig({ ...scannerConfig, enabled: v })}
            />
            <Checkbox
              label={lt(locale, "Auto-focus the scan field when opening an order", "Sipariş açıldığında tarama kutusuna otomatik odaklan", "Focus automatique sur le champ à l'ouverture d'une commande", "Enfocar automáticamente el campo al abrir un pedido", "Metti automaticamente a fuoco il campo all'apertura di un ordine", "Beim Öffnen einer Bestellung automatisch ins Scan-Feld springen")}
              checked={scannerConfig.auto_focus !== false}
              onChange={(v) => handleSaveScannerConfig({ ...scannerConfig, auto_focus: v })}
            />
            <Checkbox
              label={lt(locale, "Auto-submit on Enter (standard for USB scanners)", "Enter'da otomatik gönder (USB tarayıcılar için standart)", "Validation automatique sur Entrée (standard scanners USB)", "Enviar automáticamente al pulsar Enter (estándar en escáneres USB)", "Invia automaticamente su Invio (standard per scanner USB)", "Bei Enter automatisch senden (Standard für USB-Scanner)")}
              checked={scannerConfig.auto_submit !== false}
              onChange={(v) => handleSaveScannerConfig({ ...scannerConfig, auto_submit: v })}
            />
            <div style={{ maxWidth: 260 }}>
              <NumericTextField
                label={lt(locale, "Minimum scan length", "Minimum tarama uzunluğu", "Longueur minimale du scan", "Longitud mínima de escaneo", "Lunghezza minima scansione", "Mindestlänge des Scans")}
                helpText={lt(locale, "Ignore input shorter than this many characters (avoids accidental partial scans).", "Bundan kısa girişleri yok say (yanlışlıkla yarım taramaları önler).", "Ignore les saisies plus courtes que cela (évite les scans partiels accidentels).", "Ignora entradas más cortas (evita escaneos parciales accidentales).", "Ignora input più corti (evita scansioni parziali accidentali).", "Eingaben, die kürzer sind, werden ignoriert (verhindert versehentliche Teil-Scans).")}
                value={scannerConfig.min_length ?? 3}
                min={1}
                max={20}
                fallback={3}
                onChange={(n) => handleSaveScannerConfig({ ...scannerConfig, min_length: n })}
              />
            </div>
          </BlockStack>
        </Card>

        {isSuperuser && <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3">{copy.freeShippingTitle}</Text>
                <Text variant="bodySm" tone="subdued">{copy.freeShippingSub}</Text>
              </BlockStack>
              {savedThreshold && <Badge tone="success">{copy.saved}</Badge>}
            </InlineStack>

            {thresholdCountries.length > 0 && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                {thresholdCountries.map((code, i) => {
                  const country = countries.find((c) => c.code === code);
                  return (
                    <div key={code} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: i < thresholdCountries.length - 1 ? "1px solid #f3f4f6" : "none", background: "#fff" }}>
                      <span style={{ minWidth: 160, fontSize: 13, color: "#374151" }}>
                        <span style={{ fontWeight: 600, color: "#6d7175", fontSize: 11, marginRight: 6 }}>{code}</span>
                        {country?.label || code}
                      </span>
                      <div style={{ flex: 1, maxWidth: 160 }}>
                        <TextField
                          value={thresholds[code] || ""}
                          onChange={(v) => setThresholds((t) => ({ ...t, [code]: v }))}
                          suffix="€"
                          placeholder="0.00"
                          autoComplete="off"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setThresholdCountries((prev) => prev.filter((c) => c !== code));
                          setThresholds((t) => { const n = { ...t }; delete n[code]; return n; });
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
                        title={copy.remove}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <InlineStack gap="200" blockAlign="end">
              <div style={{ flex: 1 }}>
                <Select
                  label={copy.addCountry}
                  labelHidden
                  options={[
                    { label: copy.addCountryPlaceholder, value: "" },
                    ...countries
                      .filter((c) => !thresholdCountries.includes(c.code))
                      .map((c) => ({ label: `${c.label} (${c.code})`, value: c.code })),
                  ]}
                  value={addCountrySelect}
                  onChange={setAddCountrySelect}
                />
              </div>
              <Button
                disabled={!addCountrySelect}
                onClick={() => {
                  if (addCountrySelect && !thresholdCountries.includes(addCountrySelect)) {
                    setThresholdCountries((prev) => [...prev, addCountrySelect]);
                    setAddCountrySelect("");
                  }
                }}
              >
                {ui.add}
              </Button>
            </InlineStack>

            {thresholdErr && <Text tone="critical">{thresholdErr}</Text>}
            <InlineStack>
              <Button variant="primary" onClick={handleSaveThresholds} loading={savingThreshold}>
                {ui.save}
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>}

        {isSuperuser && <CountryOverviewSection locale={locale} copy={copy} />}

        {isSuperuser && <SendcloudSection copy={copy} ui={ui} />}

        <Divider />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">{copy.carriersTitle}</Text>
            <Text variant="bodySm" tone="subdued">{copy.carriersSub}</Text>
          </BlockStack>
          <Button variant="primary" onClick={() => setModal({ mode: "create" })}>{copy.addCarrierBtn}</Button>
        </div>

        <Card>
          <BlockStack gap="300">
            <Text variant="bodySm" tone="subdued" fontWeight="semibold">{copy.quickStart}</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRESET_CARRIERS.map((p) => (
                <Button key={p.name} size="slim" onClick={() => setModal({ mode: "create", preset: p })}>+ {p.name}</Button>
              ))}
            </div>
          </BlockStack>
        </Card>

        <Card padding="0">
          {loading && <Box padding="800"><Text alignment="center" tone="subdued">{ui.loading}</Text></Box>}
          {!loading && carriers.length === 0 && (
            <Box padding="800"><Text alignment="center" tone="subdued">{copy.noCarriers}</Text></Box>
          )}
          {carriers.map((c, i) => (
            <div key={c.id}>
              {i > 0 && <Divider />}
              <div style={{ padding: "14px 20px" }}>
                <InlineStack align="space-between" blockAlign="center" gap="400">
                  <InlineStack gap="300" blockAlign="center">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      📦
                    </div>
                    <BlockStack gap="050">
                      <Text variant="bodyMd" fontWeight="semibold">{c.name}</Text>
                      {c.tracking_url_template && <Text variant="bodySm" tone="subdued">{c.tracking_url_template}</Text>}
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={c.is_active ? "success" : undefined}>{c.is_active ? copy.active : copy.inactive}</Badge>
                    <Button size="slim" onClick={() => handleToggle(c)}>{c.is_active ? copy.deactivate : copy.activate}</Button>
                    <Button size="slim" onClick={() => setModal({ mode: "edit", carrier: c })}>{ui.edit}</Button>
                    <Button size="slim" tone="critical" onClick={() => handleDelete(c.id)}>{ui.delete}</Button>
                  </InlineStack>
                </InlineStack>
              </div>
            </div>
          ))}
        </Card>
      </BlockStack>

      {modal && (
        <CarrierModal
          mode={modal.mode}
          carrier={getModalCarrier()}
          onClose={() => setModal(null)}
          onSaved={handleCarrierSaved}
          copy={copy}
          ui={ui}
        />
      )}
    </div>
  );
}
