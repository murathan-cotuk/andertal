"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function normalizeSellerCountryCode(code) {
  const u = String(code ?? "").trim().toUpperCase();
  if (u === "UK") return "GB";
  return /^[A-Z]{2}$/.test(u) ? u : "";
}

/* ── World countries ─────────────────────────────────────────── */
const ALL_COUNTRIES = [
  { code: "AF", label: "Afghanistan" }, { code: "AL", label: "Albanien" }, { code: "DZ", label: "Algerien" },
  { code: "AD", label: "Andorra" }, { code: "AO", label: "Angola" }, { code: "AG", label: "Antigua und Barbuda" },
  { code: "AR", label: "Argentinien" }, { code: "AM", label: "Armenien" }, { code: "AU", label: "Australien" },
  { code: "AT", label: "Österreich" }, { code: "AZ", label: "Aserbaidschan" }, { code: "BS", label: "Bahamas" },
  { code: "BH", label: "Bahrain" }, { code: "BD", label: "Bangladesch" }, { code: "BB", label: "Barbados" },
  { code: "BY", label: "Belarus" }, { code: "BE", label: "Belgien" }, { code: "BZ", label: "Belize" },
  { code: "BJ", label: "Benin" }, { code: "BT", label: "Bhutan" }, { code: "BO", label: "Bolivien" },
  { code: "BA", label: "Bosnien und Herzegowina" }, { code: "BW", label: "Botswana" }, { code: "BR", label: "Brasilien" },
  { code: "BN", label: "Brunei" }, { code: "BG", label: "Bulgarien" }, { code: "BF", label: "Burkina Faso" },
  { code: "BI", label: "Burundi" }, { code: "CV", label: "Cabo Verde" }, { code: "KH", label: "Kambodscha" },
  { code: "CM", label: "Kamerun" }, { code: "CA", label: "Kanada" }, { code: "CF", label: "Zentralafrikanische Republik" },
  { code: "TD", label: "Tschad" }, { code: "CL", label: "Chile" }, { code: "CN", label: "China" },
  { code: "CO", label: "Kolumbien" }, { code: "KM", label: "Komoren" }, { code: "CG", label: "Kongo" },
  { code: "CD", label: "DR Kongo" }, { code: "CR", label: "Costa Rica" }, { code: "HR", label: "Kroatien" },
  { code: "CU", label: "Kuba" }, { code: "CY", label: "Zypern" }, { code: "CZ", label: "Tschechien" },
  { code: "DK", label: "Dänemark" }, { code: "DJ", label: "Dschibuti" }, { code: "DM", label: "Dominica" },
  { code: "DO", label: "Dominikanische Republik" }, { code: "EC", label: "Ecuador" }, { code: "EG", label: "Ägypten" },
  { code: "SV", label: "El Salvador" }, { code: "GQ", label: "Äquatorialguinea" }, { code: "ER", label: "Eritrea" },
  { code: "EE", label: "Estland" }, { code: "SZ", label: "Eswatini" }, { code: "ET", label: "Äthiopien" },
  { code: "FJ", label: "Fidschi" }, { code: "FI", label: "Finnland" }, { code: "FR", label: "Frankreich" },
  { code: "GA", label: "Gabun" }, { code: "GM", label: "Gambia" }, { code: "GE", label: "Georgien" },
  { code: "DE", label: "Deutschland" }, { code: "GH", label: "Ghana" }, { code: "GR", label: "Griechenland" },
  { code: "GD", label: "Grenada" }, { code: "GT", label: "Guatemala" }, { code: "GN", label: "Guinea" },
  { code: "GW", label: "Guinea-Bissau" }, { code: "GY", label: "Guyana" }, { code: "HT", label: "Haiti" },
  { code: "HN", label: "Honduras" }, { code: "HU", label: "Ungarn" }, { code: "IS", label: "Island" },
  { code: "IN", label: "Indien" }, { code: "ID", label: "Indonesien" }, { code: "IR", label: "Iran" },
  { code: "IQ", label: "Irak" }, { code: "IE", label: "Irland" }, { code: "IL", label: "Israel" },
  { code: "IT", label: "Italien" }, { code: "JM", label: "Jamaika" }, { code: "JP", label: "Japan" },
  { code: "JO", label: "Jordanien" }, { code: "KZ", label: "Kasachstan" }, { code: "KE", label: "Kenia" },
  { code: "KI", label: "Kiribati" }, { code: "KP", label: "Nordkorea" }, { code: "KR", label: "Südkorea" },
  { code: "KW", label: "Kuwait" }, { code: "KG", label: "Kirgisistan" }, { code: "LA", label: "Laos" },
  { code: "LV", label: "Lettland" }, { code: "LB", label: "Libanon" }, { code: "LS", label: "Lesotho" },
  { code: "LR", label: "Liberia" }, { code: "LY", label: "Libyen" }, { code: "LI", label: "Liechtenstein" },
  { code: "LT", label: "Litauen" }, { code: "LU", label: "Luxemburg" }, { code: "MG", label: "Madagaskar" },
  { code: "MW", label: "Malawi" }, { code: "MY", label: "Malaysia" }, { code: "MV", label: "Malediven" },
  { code: "ML", label: "Mali" }, { code: "MT", label: "Malta" }, { code: "MH", label: "Marshallinseln" },
  { code: "MR", label: "Mauretanien" }, { code: "MU", label: "Mauritius" }, { code: "MX", label: "Mexiko" },
  { code: "FM", label: "Mikronesien" }, { code: "MD", label: "Moldau" }, { code: "MC", label: "Monaco" },
  { code: "MN", label: "Mongolei" }, { code: "ME", label: "Montenegro" }, { code: "MA", label: "Marokko" },
  { code: "MZ", label: "Mosambik" }, { code: "MM", label: "Myanmar" }, { code: "NA", label: "Namibia" },
  { code: "NR", label: "Nauru" }, { code: "NP", label: "Nepal" }, { code: "NL", label: "Niederlande" },
  { code: "NZ", label: "Neuseeland" }, { code: "NI", label: "Nicaragua" }, { code: "NE", label: "Niger" },
  { code: "NG", label: "Nigeria" }, { code: "MK", label: "Nordmazedonien" }, { code: "NO", label: "Norwegen" },
  { code: "OM", label: "Oman" }, { code: "PK", label: "Pakistan" }, { code: "PW", label: "Palau" },
  { code: "PA", label: "Panama" }, { code: "PG", label: "Papua-Neuguinea" }, { code: "PY", label: "Paraguay" },
  { code: "PE", label: "Peru" }, { code: "PH", label: "Philippinen" }, { code: "PL", label: "Polen" },
  { code: "PT", label: "Portugal" }, { code: "QA", label: "Katar" }, { code: "RO", label: "Rumänien" },
  { code: "RU", label: "Russland" }, { code: "RW", label: "Ruanda" }, { code: "KN", label: "St. Kitts und Nevis" },
  { code: "LC", label: "St. Lucia" }, { code: "VC", label: "St. Vincent und die Grenadinen" }, { code: "WS", label: "Samoa" },
  { code: "SM", label: "San Marino" }, { code: "ST", label: "São Tomé und Príncipe" }, { code: "SA", label: "Saudi-Arabien" },
  { code: "SN", label: "Senegal" }, { code: "RS", label: "Serbien" }, { code: "SC", label: "Seychellen" },
  { code: "SL", label: "Sierra Leone" }, { code: "SG", label: "Singapur" }, { code: "SK", label: "Slowakei" },
  { code: "SI", label: "Slowenien" }, { code: "SB", label: "Salomonen" }, { code: "SO", label: "Somalia" },
  { code: "ZA", label: "Südafrika" }, { code: "SS", label: "Südsudan" }, { code: "ES", label: "Spanien" },
  { code: "LK", label: "Sri Lanka" }, { code: "SD", label: "Sudan" }, { code: "SR", label: "Suriname" },
  { code: "SE", label: "Schweden" }, { code: "CH", label: "Schweiz" }, { code: "SY", label: "Syrien" },
  { code: "TW", label: "Taiwan" }, { code: "TJ", label: "Tadschikistan" }, { code: "TZ", label: "Tansania" },
  { code: "TH", label: "Thailand" }, { code: "TL", label: "Osttimor" }, { code: "TG", label: "Togo" },
  { code: "TO", label: "Tonga" }, { code: "TT", label: "Trinidad und Tobago" }, { code: "TN", label: "Tunesien" },
  { code: "TR", label: "Türkei" }, { code: "TM", label: "Turkmenistan" }, { code: "TV", label: "Tuvalu" },
  { code: "UG", label: "Uganda" }, { code: "UA", label: "Ukraine" }, { code: "AE", label: "Vereinigte Arabische Emirate" },
  { code: "GB", label: "Vereinigtes Königreich" }, { code: "US", label: "USA" }, { code: "UY", label: "Uruguay" },
  { code: "UZ", label: "Usbekistan" }, { code: "VU", label: "Vanuatu" }, { code: "VE", label: "Venezuela" },
  { code: "VN", label: "Vietnam" }, { code: "YE", label: "Jemen" }, { code: "ZM", label: "Sambia" },
  { code: "ZW", label: "Simbabwe" },
].sort((a, b) => a.label.localeCompare(b.label, "de"));

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

function CountryPicker({ selected, onChange }) {
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

  const filtered = ALL_COUNTRIES.filter(
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
            placeholder="Land suchen…"
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
                  … {filtered.length - 80} weitere. Suche verfeinern.
                </div>
              )}
            </div>
          </>,
          document.body
        )}

        {selected.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {selected.map((code) => {
              const country = ALL_COUNTRIES.find((c) => c.code === code);
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

function ShippingGroupsSection({ carriers }) {
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
    if (!form.name) { setErr("Gruppenname ist erforderlich"); return; }
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
    } catch (e) { setErr(e?.message || "Fehler beim Speichern"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Versandgruppe löschen?")) return;
    try {
      await getMedusaAdminClient().request(`/admin-hub/v1/shipping-groups/${id}`, { method: "DELETE" });
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch (_) {}
  };

  const carrierOptions = [
    { label: "— Kein Carrier —", value: "" },
    ...carriers.map((c) => ({ label: c.name, value: c.id })),
  ];

  return (
    <BlockStack gap="400">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BlockStack gap="100">
          <Text variant="headingMd" as="h2">Versandgruppen</Text>
          <Text variant="bodySm" tone="subdued">Versandpreise pro Land für Produktgruppen verwalten.</Text>
        </BlockStack>
        <Button onClick={openCreate}>+ Neue Gruppe</Button>
      </div>

      {loading && <Text tone="subdued">Laden…</Text>}

      {!loading && groups.length === 0 && !showForm && (
        <Box padding="600" background="bg-surface-secondary" borderRadius="200">
          <Text alignment="center" tone="subdued">Noch keine Versandgruppen. Erstelle deine erste Gruppe.</Text>
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
                    {g.carrier_name && <Text variant="bodySm" tone="subdued">Carrier: {g.carrier_name}</Text>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                      {(g.prices || []).filter(p => p.price_cents > 0).map((p) => {
                        const country = ALL_COUNTRIES.find((c) => c.code === p.country_code);
                        return (
                          <span key={p.country_code} style={{ fontSize: 11, background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 8px", color: "#374151" }}>
                            {country?.label || p.country_code}: {(p.price_cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                          </span>
                        );
                      })}
                    </div>
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button size="slim" onClick={() => openEdit(g)}>Bearbeiten</Button>
                    <Button size="slim" tone="critical" onClick={() => handleDelete(g.id)}>Löschen</Button>
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
            <Text variant="headingSm" as="h3">{editingId ? "Versandgruppe bearbeiten" : "Neue Versandgruppe"}</Text>
            <InlineGrid columns={2} gap="400">
              <TextField
                label="Gruppenname"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="z.B. Standart Paket"
                autoComplete="off"
              />
              <Select
                label="Carrier"
                options={carrierOptions}
                value={form.carrier_id}
                onChange={(v) => setForm((f) => ({ ...f, carrier_id: v }))}
              />
            </InlineGrid>

            <BlockStack gap="200">
              <Text variant="bodySm" fontWeight="semibold">Lieferländer auswählen</Text>
              <CountryPicker
                selected={form.selectedCountries}
                onChange={handleCountriesChange}
              />
            </BlockStack>

            {form.selectedCountries.length > 0 && (
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="semibold">Versandpreise</Text>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                  {form.selectedCountries.map((code, i) => {
                    const country = ALL_COUNTRIES.find((c) => c.code === code);
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
                          title="Land entfernen"
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
              <Button onClick={() => { setShowForm(false); setEditingId(null); }}>Abbrechen</Button>
              <Button variant="primary" onClick={handleSave} loading={saving}>Speichern</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}

/* ── Carrier modal ───────────────────────────────────────────── */
const EMPTY_CARRIER_FORM = { name: "", tracking_url_template: "", api_key: "", api_secret: "", is_active: true };

function CarrierModal({ mode, carrier, onClose, onSaved }) {
  const [form, setForm] = useState(
    carrier
      ? { name: carrier.name || "", tracking_url_template: carrier.tracking_url_template || "", api_key: carrier.api_key || "", api_secret: carrier.api_secret || "", is_active: carrier.is_active !== false }
      : EMPTY_CARRIER_FORM
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!form.name) { setErr("Name ist erforderlich"); return; }
    setSaving(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const res = mode === "edit"
        ? await client.updateCarrier(carrier.id, form)
        : await client.createCarrier(form);
      onSaved(res.carrier, mode);
      onClose();
    } catch (e) { setErr(e?.message || "Fehler"); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="headingMd" as="h3">{mode === "edit" ? "Carrier bearbeiten" : "Carrier hinzufügen"}</Text>
          <Button variant="plain" onClick={onClose}>✕</Button>
        </div>
        <div style={{ padding: 20 }}>
          <BlockStack gap="400">
            <TextField label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="z.B. DHL" autoComplete="off" />
            <TextField
              label={<>Tracking-URL <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>({"{tracking}"} als Platzhalter)</span></>}
              value={form.tracking_url_template}
              onChange={(v) => setForm((f) => ({ ...f, tracking_url_template: v }))}
              placeholder="https://carrier.com/track/{tracking}"
              autoComplete="off"
            />
            <TextField label={<>API-Schlüssel <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>(optional)</span></>} value={form.api_key} onChange={(v) => setForm((f) => ({ ...f, api_key: v }))} type="password" autoComplete="off" />
            <TextField label={<>API-Geheimnis <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>(optional)</span></>} value={form.api_secret} onChange={(v) => setForm((f) => ({ ...f, api_secret: v }))} type="password" autoComplete="off" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Aktiv
            </label>
            {err && <Banner tone="critical"><p>{err}</p></Banner>}
          </BlockStack>
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb" }}>
          <InlineStack gap="200" align="end">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>Speichern</Button>
          </InlineStack>
        </div>
      </div>
    </div>
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

const LS_THRESHOLDS_KEY = "andertal_free_shipping_thresholds";

export default function ShippingSettingsPage() {
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

  const load = useCallback(async () => {
    setLoading(true);
    const [carriersData, settings] = await Promise.all([
      getMedusaAdminClient().getCarriers(),
      getMedusaAdminClient().getSellerSettings().catch(() => ({})),
    ]);
    setCarriers(carriersData.carriers || []);
    setCurrentStoreName(settings?.store_name || "");
    const fromBackend = settings?.free_shipping_thresholds;
    const fromLS = typeof window !== "undefined" ? window.localStorage.getItem(LS_THRESHOLDS_KEY) : null;
    const thresholdData = fromBackend ?? (fromLS ? JSON.parse(fromLS) : null);
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
        store_name: currentStoreName,
        free_shipping_thresholds: thresholdCents,
      });
      if (typeof window !== "undefined") window.localStorage.setItem(LS_THRESHOLDS_KEY, JSON.stringify(thresholdCents));
      setSavedThreshold(true);
      setTimeout(() => setSavedThreshold(false), 3000);
    } catch (e) {
      setThresholdErr(e?.message || "Fehler beim Speichern");
    }
    setSavingThreshold(false);
  };

  const handleCarrierSaved = (carrier, mode) => {
    if (mode === "edit") {
      setCarriers((prev) => prev.map((c) => (c.id === carrier?.id ? { ...c, ...carrier } : c)));
    } else {
      if (carrier) setCarriers((prev) => [...prev, carrier]);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Carrier löschen?")) return;
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
          <Text variant="headingLg" as="h1">Versand & Lieferung</Text>
        </div>

        <ShippingGroupsSection carriers={carriers} />

        {isSuperuser && <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingSm" as="h3">Versandkostenfrei ab</Text>
                <Text variant="bodySm" tone="subdued">Mindestbestellwert für kostenlosen Versand pro Land.</Text>
              </BlockStack>
              {savedThreshold && <Badge tone="success">Gespeichert ✓</Badge>}
            </InlineStack>

            {thresholdCountries.length > 0 && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                {thresholdCountries.map((code, i) => {
                  const country = ALL_COUNTRIES.find((c) => c.code === code);
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
                        title="Entfernen"
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
                  label="Land hinzufügen"
                  labelHidden
                  options={[
                    { label: "Land hinzufügen…", value: "" },
                    ...ALL_COUNTRIES
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
                Hinzufügen
              </Button>
            </InlineStack>

            {thresholdErr && <Text tone="critical">{thresholdErr}</Text>}
            <InlineStack>
              <Button variant="primary" onClick={handleSaveThresholds} loading={savingThreshold}>
                Speichern
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>}

        <Divider />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">Versanddienstleister</Text>
            <Text variant="bodySm" tone="subdued">Versanddienstleister verwalten und Tracking-URLs konfigurieren.</Text>
          </BlockStack>
          <Button variant="primary" onClick={() => setModal({ mode: "create" })}>+ Carrier hinzufügen</Button>
        </div>

        <Card>
          <BlockStack gap="300">
            <Text variant="bodySm" tone="subdued" fontWeight="semibold">Schnellstart — Vorkonfigurierte Carrier</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRESET_CARRIERS.map((p) => (
                <Button key={p.name} size="slim" onClick={() => setModal({ mode: "create", preset: p })}>+ {p.name}</Button>
              ))}
            </div>
          </BlockStack>
        </Card>

        <Card padding="0">
          {loading && <Box padding="800"><Text alignment="center" tone="subdued">Laden…</Text></Box>}
          {!loading && carriers.length === 0 && (
            <Box padding="800"><Text alignment="center" tone="subdued">Noch keine Carrier konfiguriert.</Text></Box>
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
                    <Badge tone={c.is_active ? "success" : undefined}>{c.is_active ? "Aktiv" : "Inaktiv"}</Badge>
                    <Button size="slim" onClick={() => handleToggle(c)}>{c.is_active ? "Deaktivieren" : "Aktivieren"}</Button>
                    <Button size="slim" onClick={() => setModal({ mode: "edit", carrier: c })}>Bearbeiten</Button>
                    <Button size="slim" tone="critical" onClick={() => handleDelete(c.id)}>Löschen</Button>
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
        />
      )}
    </div>
  );
}
