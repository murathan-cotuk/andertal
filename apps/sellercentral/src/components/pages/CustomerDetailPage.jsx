"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Modal, BlockStack, TextField, Text, Button, InlineStack } from "@shopify/polaris";
import { EditIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function fmtCents(c) {
  return (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + " / " + dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtBirthDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

function bonusSourceLabel(source) {
  const m = {
    registration: "Registrierung",
    order_earn: "Bestellung (Gutschrift)",
    order_redeem: "Bestellung (Einlösung)",
    manual: "Manuell",
  };
  return m[source] || source || "—";
}

const STATUS_COLORS = {
  paid: { bg: "#d1fae5", color: "#065f46" }, bezahlt: { bg: "#d1fae5", color: "#065f46" },
  pending: { bg: "#fef3c7", color: "#92400e" }, ausstehend: { bg: "#fef3c7", color: "#92400e" },
  versendet: { bg: "#dbeafe", color: "#1e40af" },
  abgeschlossen: { bg: "#d1fae5", color: "#065f46" },
  cancelled: { bg: "#fee2e2", color: "#991b1b" }, storniert: { bg: "#fee2e2", color: "#991b1b" },
  offen: { bg: "#fff7ed", color: "#c2410c" },
};
function StatusBadge({ value }) {
  const s = STATUS_COLORS[value?.toLowerCase()] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, fontWeight: 600 }}>
      {value || "—"}
    </span>
  );
}

function Card({ title, action, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
      {title && (
        <div style={{ padding: "13px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>{title}</h3>
          {action}
        </div>
      )}
      <div style={{ padding: "4px 20px 16px" }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f9fafb", alignItems: "flex-start" }}>
      <span style={{ width: 160, flexShrink: 0, fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: "#111827",
          flex: 1,
          minWidth: 0,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          fontFamily: mono ? "ui-monospace, monospace" : undefined,
        }}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function AddressBlock({ label, line1, line2, zip, city, country }) {
  if (!line1 && !city) return <InfoRow label={label} value={null} />;
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f9fafb" }}>
      <span style={{ width: 160, flexShrink: 0, fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{label}</span>
      <div style={{ fontSize: 13, color: "#111827", flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "anywhere" }}>
        {line1 && <div>{line1}</div>}
        {line2 && <div>{line2}</div>}
        {(zip || city) && <div>{[zip, city].filter(Boolean).join(" ")}</div>}
        {country && <div>{country}</div>}
      </div>
    </div>
  );
}

function DiscountModal({ customerId, onClose, onAdded }) {
  const [form, setForm] = useState({ code: "", type: "percentage", value: "", min_order_cents: "", max_uses: "1", expires_at: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 3 };

  const handleSave = async () => {
    if (!form.code) { setErr("Code ist erforderlich"); return; }
    if (!form.value) { setErr("Wert ist erforderlich"); return; }
    setSaving(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      await client.createCustomerDiscount(customerId, {
        code: form.code,
        type: form.type,
        value: Number(form.value),
        min_order_cents: form.min_order_cents ? Math.round(Number(form.min_order_cents) * 100) : 0,
        max_uses: Number(form.max_uses || 1),
        expires_at: form.expires_at || null,
        notes: form.notes || null,
      });
      onAdded();
      onClose();
    } catch (e) { setErr(e?.message || "Fehler"); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, width: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Rabattcode erstellen</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Code *</label>
            <input style={inp} value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="SOMMER20" />
          </div>
          <div>
            <label style={lbl}>Typ</label>
            <select style={inp} value={form.type} onChange={e => set("type", e.target.value)}>
              <option value="percentage">Prozent (%)</option>
              <option value="fixed">Festbetrag (€)</option>
              <option value="free_shipping">Versandkostenfrei</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Wert *</label>
            <input style={inp} type="number" value={form.value} onChange={e => set("value", e.target.value)} placeholder={form.type === "percentage" ? "10" : "5.00"} />
          </div>
          <div>
            <label style={lbl}>Mindestbestellwert (€)</label>
            <input style={inp} type="number" value={form.min_order_cents} onChange={e => set("min_order_cents", e.target.value)} placeholder="0" />
          </div>
          <div>
            <label style={lbl}>Max. Verwendungen</label>
            <input style={inp} type="number" min="1" value={form.max_uses} onChange={e => set("max_uses", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Gültig bis</label>
            <input style={inp} type="date" value={form.expires_at} onChange={e => set("expires_at", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Notizen</label>
            <input style={inp} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>
        {err && <div style={{ margin: "0 24px 12px", color: "#ef4444", fontSize: 12 }}>{err}</div>}
        <div style={{ padding: "12px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end" }}>
          <InlineStack gap="200">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Erstellen
            </Button>
          </InlineStack>
        </div>
      </div>
    </div>
  );
}

function BonusLedgerAddModal({ open, onClose, customerId, onAdded }) {
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setDescription("");
      setPoints("");
      setErr("");
    }
  }, [open]);

  const handleAdd = async () => {
    const desc = description.trim();
    const pts = parseInt(String(points).replace(/[^\d-]/g, ""), 10);
    if (!desc) {
      setErr("Beschreibung ist erforderlich");
      return;
    }
    if (!Number.isFinite(pts) || pts === 0) {
      setErr("Punkte müssen eine von 0 verschiedene ganze Zahl sein");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const client = getMedusaAdminClient();
      const res = await client.addCustomerBonusLedgerEntry(customerId, {
        description: desc,
        points_delta: pts,
      });
      if (res?.entry) {
        onAdded(res);
        onClose();
      }
    } catch (e) {
      setErr(e?.message || "Fehler");
    }
    setSaving(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Bonuspunkte buchen"
      primaryAction={{
        content: "Hinzufügen",
        onAction: handleAdd,
        loading: saving,
      }}
      secondaryActions={[{ content: "Abbrechen", onAction: () => !saving && onClose() }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p" tone="subdued">
            Das Buchungsdatum ist automatisch der heutige Tag. Positive Zahlen gutschreiben, negative zum Abziehen.
          </Text>
          <TextField
            label="Beschreibung"
            value={description}
            onChange={setDescription}
            autoComplete="off"
            placeholder="z. B. Kulanz, Korrektur …"
          />
          <TextField
            label="Bonuspunkte"
            value={points}
            onChange={setPoints}
            autoComplete="off"
            placeholder="+50 oder −20"
            helpText="Ganze Zahl, nicht 0"
            inputMode="numeric"
          />
          {err ? (
            <Text as="p" tone="critical">
              {err}
            </Text>
          ) : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = params?.locale || "de";
  const id = params?.id;

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showBonusLedgerModal, setShowBonusLedgerModal] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [editBonus, setEditBonus] = useState(false);
  const [bonusVal, setBonusVal] = useState("");
  const [savingBonus, setSavingBonus] = useState(false);
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [ledgerEdit, setLedgerEdit] = useState(null);

  const loadCustomer = async () => {
    try {
      const client = getMedusaAdminClient();
      const res = await client.getCustomerById(id);
      setCustomer(res?.customer || null);
      setNotesVal(res?.customer?.notes || "");
      setBonusVal(String(res?.customer?.bonus_points || 0));
    } catch (e) {
      setError(e?.message || "Fehler");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    loadCustomer();
  }, [id]);

  const orders = customer?.orders || [];
  const discounts = customer?.discounts || [];
  const bonusLedger = Array.isArray(customer?.bonus_ledger) ? customer.bonus_ledger : [];
  const totalSpent = orders.reduce((s, o) => s + Number(o.total_cents || 0), 0);
  const avgOrder = orders.length > 0 ? totalSpent / orders.length : 0;
  const firstOrder = orders.length > 0 ? orders[orders.length - 1]?.created_at : null;
  const lastOrder = orders.length > 0 ? orders[0]?.created_at : null;

  const fullName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || customer?.email || "—";

  const accountTypeLabel = () => {
    if (customer?.account_type === "gastkunde") return "Gastkunde";
    if (customer?.account_type === "gewerbe") return "Gewerbekunde";
    return "Privatkunde";
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const client = getMedusaAdminClient();
      await client.updateCustomer(id, { notes: notesVal });
      setCustomer(c => ({ ...c, notes: notesVal }));
      setEditNotes(false);
    } catch { }
    setSavingNotes(false);
  };

  const handleSaveBonus = async () => {
    setSavingBonus(true);
    try {
      const client = getMedusaAdminClient();
      await client.updateCustomer(id, { bonus_points: Number(bonusVal) });
      setCustomer(c => ({ ...c, bonus_points: Number(bonusVal) }));
      setEditBonus(false);
    } catch { }
    setSavingBonus(false);
  };

  const handleDeleteDiscount = async (discountId) => {
    try {
      const client = getMedusaAdminClient();
      await client.deleteCustomerDiscount(id, discountId);
      setCustomer(c => ({ ...c, discounts: c.discounts.filter(d => d.id !== discountId) }));
    } catch { }
  };

  const handleBonusLedgerAdded = (res) => {
    if (!res?.entry) return;
    setCustomer((c) => ({
      ...c,
      bonus_points: res.bonus_points != null ? res.bonus_points : c.bonus_points,
      bonus_ledger: [res.entry, ...(c.bonus_ledger || [])],
    }));
    setBonusVal(String(res.bonus_points ?? ""));
  };

  const handleSaveLedgerEdit = async () => {
    if (!ledgerEdit?.id) return;
    const pts = parseInt(String(ledgerEdit.points_delta).replace(/[^\d-]/g, ""), 10);
    if (!ledgerEdit.description?.trim() || !Number.isFinite(pts) || pts === 0) return;
    setLedgerSaving(true);
    try {
      const client = getMedusaAdminClient();
      const res = await client.updateCustomerBonusLedgerEntry(id, ledgerEdit.id, {
        description: ledgerEdit.description.trim(),
        points_delta: pts,
      });
      if (res?.entry) {
        setCustomer((c) => ({
          ...c,
          bonus_points: res.bonus_points != null ? res.bonus_points : c.bonus_points,
          bonus_ledger: (c.bonus_ledger || []).map((e) => (e.id === res.entry.id ? res.entry : e)),
        }));
        setBonusVal(String(res.bonus_points ?? ""));
        setLedgerEdit(null);
      }
    } catch { }
    setLedgerSaving(false);
  };

  // --- Billing address: prefer stored customer billing address, fallback to last order billing ---
  const billingFromOrders = orders.find(o => o.billing_address_line1);
  const hasStoredBilling = customer?.billing_address_line1 || customer?.billing_city;

  return (
    <div style={{ padding: 24, maxWidth: 1320, margin: "0 auto", boxSizing: "border-box" }}>
      {showDiscountModal && (
        <DiscountModal
          customerId={id}
          onClose={() => setShowDiscountModal(false)}
          onAdded={() => { loadCustomer(); }}
        />
      )}
      <BonusLedgerAddModal
        open={showBonusLedgerModal}
        onClose={() => setShowBonusLedgerModal(false)}
        customerId={id}
        onAdded={handleBonusLedgerAdded}
      />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <div style={{ flexShrink: 0, marginTop: 4 }}>
          <Button onClick={() => router.push(`/${locale}/customers`)}>← Zurück</Button>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
              {loading ? "Laden…" : fullName}
            </h1>
            {customer && (
              <>
                {customer.is_registered ? (
                  <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: "#d1fae5", color: "#065f46", fontWeight: 600 }}>Registriert</span>
                ) : (
                  <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280", fontWeight: 600 }}>Gastkunde</span>
                )}
                {customer.newsletter_opted_in && (
                  <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: "#ede9fe", color: "#6d28d9", fontWeight: 600 }}>Newsletter</span>
                )}
              </>
            )}
          </div>
          {customer?.customer_number && (
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 3 }}>
              #{customer.customer_number} · {customer.email}
            </div>
          )}
        </div>
        {customer && (
          <button
            onClick={() => router.push(`/${locale}/customers/${id}/edit`)}
            style={{ padding: "7px 16px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, cursor: "pointer", background: "#fff", flexShrink: 0 }}
          >
            Bearbeiten
          </button>
        )}
      </div>

      {loading && (
        <div style={{ padding: 60, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>Laden…</div>
      )}
      {!loading && error && (
        <div style={{ padding: 40, textAlign: "center", color: "#ef4444", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>{error}</div>
      )}

      {!loading && !error && customer && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(400px, 440px)", gap: 20, alignItems: "start" }}>
          {/* LEFT COLUMN */}
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Gesamtumsatz", value: fmtCents(totalSpent), icon: "💰" },
                { label: "Bestellungen", value: orders.length, icon: "📦" },
                { label: "Ø Bestellwert", value: fmtCents(avgOrder), icon: "📊" },
                { label: "Bonuspunkte", value: customer.bonus_points || 0, icon: "⭐", editable: true, onEdit: () => { setBonusVal(String(customer.bonus_points || 0)); setEditBonus(true); } },
              ].map((s, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    {s.editable && (
                      <Button variant="plain" size="micro" onClick={s.onEdit}>
                        Ändern
                      </Button>
                    )}
                  </div>
                  {editBonus && s.editable ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="number"
                        value={bonusVal}
                        onChange={e => setBonusVal(e.target.value)}
                        style={{ width: 70, padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 5, fontSize: 13 }}
                        autoFocus
                      />
                      <Button size="micro" variant="primary" onClick={handleSaveBonus} disabled={savingBonus} loading={savingBonus}>
                        Speichern
                      </Button>
                      <Button size="micro" onClick={() => setEditBonus(false)}>
                        Abbrechen
                      </Button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{s.value}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Order history */}
            <Card title={`Bestellhistorie (${orders.length})`}>
              {orders.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af", padding: "12px 0" }}>Keine Bestellungen</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                  <thead>
                    <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>Nr.</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>Zahlung</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>Lieferung</th>
                      <th style={{ textAlign: "right", padding: "4px 0 10px" }}>Betrag</th>
                      <th style={{ textAlign: "right", padding: "4px 0 10px" }}>Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                        onClick={() => router.push(`/${locale}/orders/${o.id}`)}
                        onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}
                      >
                        <td style={{ padding: "9px 0", fontWeight: 600, color: "#202223" }}>#{o.order_number || "—"}</td>
                        <td style={{ padding: "9px 0" }}><StatusBadge value={o.order_status} /></td>
                        <td style={{ padding: "9px 0" }}><StatusBadge value={o.payment_status} /></td>
                        <td style={{ padding: "9px 0" }}><StatusBadge value={o.delivery_status} /></td>
                        <td style={{ padding: "9px 0", textAlign: "right", fontWeight: 600 }}>{fmtCents(o.total_cents)}</td>
                        <td style={{ padding: "9px 0", textAlign: "right", color: "#6b7280", fontSize: 12 }}>{fmtDateShort(o.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Discounts */}
            <Card
              title="Rabatte & Gutscheine"
              action={
                <Button size="slim" variant="primary" onClick={() => setShowDiscountModal(true)}>
                  Hinzufügen
                </Button>
              }
            >
              {discounts.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af", padding: "12px 0" }}>Keine Rabattcodes</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                  <thead>
                    <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>Code</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>Typ</th>
                      <th style={{ textAlign: "right", padding: "4px 0 10px" }}>Wert</th>
                      <th style={{ textAlign: "right", padding: "4px 0 10px" }}>Nutzungen</th>
                      <th style={{ textAlign: "right", padding: "4px 0 10px" }}>Gültig bis</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {discounts.map((d, i) => {
                      const isExpired = d.expires_at && new Date(d.expires_at) < new Date();
                      const isExhausted = d.used_count >= d.max_uses;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", opacity: (isExpired || isExhausted) ? 0.5 : 1 }}>
                          <td style={{ padding: "8px 0", fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>{d.code}</td>
                          <td style={{ padding: "8px 0", color: "#6b7280" }}>{d.type === "percentage" ? "%" : d.type === "fixed" ? "Fest" : "Versand"}</td>
                          <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>
                            {d.type === "percentage" ? `${d.value}%` : d.type === "fixed" ? `${Number(d.value).toFixed(2)} €` : "—"}
                          </td>
                          <td style={{ padding: "8px 0", textAlign: "right", color: "#6b7280" }}>{d.used_count}/{d.max_uses}</td>
                          <td style={{ padding: "8px 0", textAlign: "right", fontSize: 12, color: isExpired ? "#ef4444" : "#6b7280" }}>
                            {d.expires_at ? fmtDateShort(d.expires_at) : "—"}
                          </td>
                          <td style={{ padding: "8px 0", textAlign: "right" }}>
                            <button onClick={() => handleDeleteDiscount(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12 }}>Löschen</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Notes */}
            <Card
              title="Notizen"
              action={!editNotes && (
                <Button size="slim" onClick={() => setEditNotes(true)}>
                  Bearbeiten
                </Button>
              )}
            >
              {editNotes ? (
                <div style={{ paddingTop: 8 }}>
                  <textarea
                    value={notesVal}
                    onChange={e => setNotesVal(e.target.value)}
                    style={{ width: "100%", height: 100, padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                    placeholder="Interne Notizen zum Kunden…"
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Button variant="primary" onClick={handleSaveNotes} disabled={savingNotes} loading={savingNotes}>
                      Speichern
                    </Button>
                    <Button onClick={() => { setEditNotes(false); setNotesVal(customer?.notes || ""); }}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: notesVal ? "#111827" : "#9ca3af", margin: "10px 0 4px", whiteSpace: "pre-wrap" }}>
                  {notesVal || "Keine Notizen"}
                </p>
              )}
            </Card>

            {/* Bonus ledger */}
            <Card
              title="Bonuspunkte — Verlauf"
              action={
                <Button size="slim" variant="primary" onClick={() => setShowBonusLedgerModal(true)}>
                  Hinzufügen
                </Button>
              }
            >
              {bonusLedger.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af", padding: "8px 0" }}>Noch keine Einträge im Verlauf.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                        <th style={{ textAlign: "left", padding: "6px 8px 10px", width: 110 }}>Datum</th>
                        <th style={{ textAlign: "left", padding: "6px 8px 10px" }}>Beschreibung</th>
                        <th style={{ textAlign: "right", padding: "6px 8px 10px", width: 100 }}>Bonuspunkte</th>
                        <th style={{ textAlign: "right", padding: "6px 8px 10px", width: 1 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {bonusLedger.map((row) => {
                        const isEdit = ledgerEdit?.id === row.id;
                        return (
                          <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6", verticalAlign: "top" }}>
                            <td style={{ padding: "10px 8px", whiteSpace: "nowrap", color: "#6b7280", fontSize: 12 }}>
                              {fmtDateShort(row.occurred_at)}
                            </td>
                            <td style={{ padding: "10px 8px", minWidth: 180 }}>
                              {isEdit ? (
                                <input
                                  value={ledgerEdit.description}
                                  onChange={(e) => setLedgerEdit((le) => ({ ...le, description: e.target.value }))}
                                  style={{ width: "100%", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, boxSizing: "border-box" }}
                                />
                              ) : (
                                <div>
                                  <span style={{ color: "#111827" }}>{row.description}</span>
                                  {row.source && row.source !== "manual" && (
                                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{bonusSourceLabel(row.source)}</div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: row.points_delta >= 0 ? "#065f46" : "#991b1b" }}>
                              {isEdit ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={ledgerEdit.points_delta}
                                  onChange={(e) => setLedgerEdit((le) => ({ ...le, points_delta: e.target.value }))}
                                  style={{ width: 72, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, textAlign: "right" }}
                                />
                              ) : (
                                `${row.points_delta > 0 ? "+" : ""}${row.points_delta}`
                              )}
                            </td>
                            <td style={{ padding: "10px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {isEdit ? (
                                <InlineStack gap="200" blockAlign="center">
                                  <Button size="slim" variant="primary" onClick={handleSaveLedgerEdit} disabled={ledgerSaving} loading={ledgerSaving}>
                                    Speichern
                                  </Button>
                                  <Button size="slim" onClick={() => setLedgerEdit(null)}>
                                    Abbrechen
                                  </Button>
                                </InlineStack>
                              ) : (
                                <Button
                                  size="slim"
                                  variant="plain"
                                  tone="subdued"
                                  icon={EditIcon}
                                  accessibilityLabel="Bearbeiten"
                                  onClick={() =>
                                    setLedgerEdit({
                                      id: row.id,
                                      description: row.description,
                                      points_delta: String(row.points_delta),
                                    })
                                  }
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* RIGHT COLUMN */}
          <div>
            {/* Customer info */}
            <Card title="Kundenprofil">
              <InfoRow label="Vorname" value={customer.first_name} />
              <InfoRow label="Nachname" value={customer.last_name} />
              <InfoRow label="E-Mail" value={customer.email} />
              <InfoRow label="Telefon" value={customer.phone} />
              {customer.gender && <InfoRow label="Geschlecht" value={customer.gender === "male" ? "Männlich" : customer.gender === "female" ? "Weiblich" : customer.gender} />}
              {customer.birth_date && <InfoRow label="Geburtsdatum" value={fmtBirthDate(customer.birth_date)} />}
              <InfoRow label="Kundentyp" value={accountTypeLabel()} />
              <InfoRow label="Konto" value={customer.is_registered ? "Registriert" : "Gastkunde"} />
              <InfoRow label="Newsletter" value={customer.newsletter_opted_in ? "✓ Abonniert" : "Nicht abonniert"} />
              {customer.email_marketing_consent && <InfoRow label="Marketing E-Mail" value="Zugestimmt" />}
              {customer.account_type === "gewerbe" && (
                <>
                  <InfoRow label="Firmenname" value={customer.company_name} />
                  <InfoRow label="USt-IdNr." value={customer.vat_number} mono />
                </>
              )}
              <InfoRow label="Kundennummer" value={customer.customer_number ? `#${customer.customer_number}` : "—"} />
              <InfoRow label="Erstellt am" value={fmtDateShort(customer.created_at)} />
              <InfoRow label="Erste Bestellung" value={fmtDateShort(firstOrder)} />
              <InfoRow label="Letzte Bestellung" value={fmtDateShort(lastOrder)} />
            </Card>

            {/* Delivery address */}
            <Card title="Lieferadresse">
              <AddressBlock
                label=""
                line1={customer.address_line1}
                line2={customer.address_line2}
                zip={customer.zip_code}
                city={customer.city}
                country={customer.country}
              />
              {!customer.address_line1 && !customer.city && (
                <p style={{ fontSize: 13, color: "#9ca3af", margin: "10px 0 4px" }}>Keine Lieferadresse</p>
              )}
            </Card>

            {/* Billing address */}
            <Card title="Rechnungsadresse">
              {hasStoredBilling ? (
                <AddressBlock
                  label=""
                  line1={customer.billing_address_line1}
                  line2={customer.billing_address_line2}
                  zip={customer.billing_zip_code}
                  city={customer.billing_city}
                  country={customer.billing_country}
                />
              ) : billingFromOrders ? (
                <>
                  <AddressBlock
                    label=""
                    line1={billingFromOrders.billing_address_line1}
                    line2={billingFromOrders.billing_address_line2}
                    zip={billingFromOrders.billing_postal_code}
                    city={billingFromOrders.billing_city}
                    country={billingFromOrders.billing_country}
                  />
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>Aus letzter Bestellung</p>
                </>
              ) : (customer.address_line1 || customer.city) ? (
                <p style={{ fontSize: 13, color: "#6b7280", margin: "10px 0 4px", lineHeight: 1.5 }}>
                  Entspricht der Lieferadresse (keine abweichende Rechnungsadresse).
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "#9ca3af", margin: "10px 0 4px" }}>
                  Keine Rechnungsadresse hinterlegt.
                </p>
              )}
            </Card>

            {/* Timeline */}
            <Card title="Aktivität">
              <div style={{ paddingTop: 8 }}>
                {[
                  customer.created_at && { date: customer.created_at, text: "Kunde erstellt" },
                  firstOrder && { date: firstOrder, text: "Erste Bestellung" },
                  orders.length > 1 && lastOrder && { date: lastOrder, text: "Letzte Bestellung" },
                ].filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date)).map((ev, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#008060", marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.text}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{fmtDateShort(ev.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
