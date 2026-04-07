"use client";

import React, { useState, useEffect } from "react";

export const EMPTY_CUSTOMER_FORM = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  account_type: "privat",
  country: "",
  address_line1: "",
  address_line2: "",
  zip_code: "",
  city: "",
  company_name: "",
  vat_number: "",
};

function formFromInitial(initial) {
  if (!initial) return { ...EMPTY_CUSTOMER_FORM };
  return {
    email: initial.email ?? "",
    first_name: initial.first_name ?? "",
    last_name: initial.last_name ?? "",
    phone: initial.phone ?? "",
    account_type: initial.account_type ?? "privat",
    country: initial.country ?? "",
    address_line1: initial.address_line1 ?? "",
    address_line2: initial.address_line2 ?? "",
    zip_code: initial.zip_code ?? "",
    city: initial.city ?? "",
    company_name: initial.company_name ?? "",
    vat_number: initial.vat_number ?? "",
  };
}

/**
 * Create / edit customer — shared by Kunden list and Kundendetail.
 */
export function CustomerFormModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(() => formFromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setForm(formFromInitial(initial));
    setErr("");
  }, [initial]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.email) {
      setErr("E-Mail ist erforderlich");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setErr(e?.message || "Fehler beim Speichern");
    }
    setSaving(false);
  };

  const inputStyle = { width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "border-color .15s, box-shadow .15s" };
  const labelStyle = { fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 3 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 18px 48px rgba(15,23,42,0.18)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{initial?.id ? "Kunde bearbeiten" : "Neuer Kunde"}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>E-Mail *</label>
            <input style={inputStyle} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="kunde@beispiel.de" onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          <div>
            <label style={labelStyle}>Vorname</label>
            <input style={inputStyle} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          <div>
            <label style={labelStyle}>Nachname</label>
            <input style={inputStyle} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          <div>
            <label style={labelStyle}>Telefon</label>
            <input style={inputStyle} value={form.phone} onChange={(e) => set("phone", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          <div>
            <label style={labelStyle}>Kundentyp</label>
            <select style={inputStyle} value={form.account_type} onChange={(e) => set("account_type", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }}>
              <option value="privat">Privatkunde</option>
              <option value="gewerbe">Gewerbekunde</option>
              <option value="gastkunde">Gastkunde</option>
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>Straße</label>
            <input style={inputStyle} value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          <div>
            <label style={labelStyle}>PLZ</label>
            <input style={inputStyle} value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          <div>
            <label style={labelStyle}>Stadt</label>
            <input style={inputStyle} value={form.city} onChange={(e) => set("city", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          <div>
            <label style={labelStyle}>Land (Code)</label>
            <input style={inputStyle} value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="DE" onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          {form.account_type === "gewerbe" && (
            <>
              <div>
                <label style={labelStyle}>Firmenname</label>
                <input style={inputStyle} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>USt-IdNr.</label>
                <input style={inputStyle} value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(17,24,39,0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }} />
              </div>
            </>
          )}
        </div>
        {err && <div style={{ margin: "0 24px 12px", color: "#ef4444", fontSize: 12 }}>{err}</div>}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 18px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, cursor: "pointer", background: "#fff" }}>Abbrechen</button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ padding: "8px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
