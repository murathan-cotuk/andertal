"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { lt } from "@/lib/locale-text";
import { useRouter } from "@/i18n/navigation";
import { getUI } from "@/lib/ui-strings";
import { Modal, BlockStack, TextField, Text, Button, InlineStack } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { statusLabel } from "@/lib/status-labels";
import { CustomerFormModal } from "@/components/CustomerFormModal";

function fmtCents(c, locale) {
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  return (Number(c || 0) / 100).toLocaleString(loc, { minimumFractionDigits: 2 }) + " €";
}
function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  const dt = new Date(d);
  return dt.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" }) + " / " + dt.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(d, locale) {
  if (!d) return "—";
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  return new Date(d).toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtBirthDate(d, locale) {
  if (!d) return "—";
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  return new Date(d).toLocaleDateString(loc, { day: "2-digit", month: "long", year: "numeric" });
}

function bonusSourceLabel(source, locale) {
  const m = {
    en: { registration: "Registration", order_earn: "Order (credit)", order_redeem: "Order (redeem)", manual: "Manual" },
    tr: { registration: "Kayıt", order_earn: "Sipariş (alacak)", order_redeem: "Sipariş (kullanım)", manual: "Manuel" },
    fr: { registration: "Inscription", order_earn: "Commande (crédit)", order_redeem: "Commande (débit)", manual: "Manuel" },
    es: { registration: "Registro", order_earn: "Pedido (abono)", order_redeem: "Pedido (débito)", manual: "Manual" },
    it: { registration: "Registrazione", order_earn: "Ordine (credito)", order_redeem: "Ordine (debito)", manual: "Manuale" },
    de: { registration: "Registrierung", order_earn: "Bestellung (Gutschrift)", order_redeem: "Bestellung (Einlösung)", manual: "Manuell" },
  };
  return (m[locale] || m.de)[source] || source || "—";
}

const STATUS_COLORS = {
  paid: { bg: "#d1fae5", color: "#065f46" }, bezahlt: { bg: "#d1fae5", color: "#065f46" },
  pending: { bg: "#fef3c7", color: "#92400e" }, ausstehend: { bg: "#fef3c7", color: "#92400e" },
  versendet: { bg: "#dbeafe", color: "#1e40af" },
  abgeschlossen: { bg: "#d1fae5", color: "#065f46" },
  zugestellt: { bg: "#d1fae5", color: "#065f46" },
  cancelled: { bg: "#fee2e2", color: "#991b1b" }, storniert: { bg: "#fee2e2", color: "#991b1b" },
  offen: { bg: "#fff7ed", color: "#c2410c" },
  retoure: { bg: "#fef2f2", color: "#b91c1c" },
  retoure_anfrage: { bg: "#fffbeb", color: "#b45309" },
  refunded: { bg: "#eff6ff", color: "#1d4ed8" },
};
function StatusBadge({ value }) {
  const locale = useLocale();
  const s = STATUS_COLORS[value?.toLowerCase()] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, fontWeight: 600 }}>
      {value ? statusLabel(locale, value) : "—"}
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

function DiscountModal({ customerId, onClose, onAdded, ui, locale }) {
  const [form, setForm] = useState({ code: "", type: "percentage", value: "", min_order_cents: "", max_uses: "1", expires_at: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 3 };

  const handleSave = async () => {
    if (!form.code) { setErr(locale === "en" ? "Code is required" : locale === "tr" ? "Kod gereklidir" : locale === "fr" ? "Le code est requis" : locale === "es" ? "El código es obligatorio" : locale === "it" ? "Il codice è obbligatorio" : "Code ist erforderlich"); return; }
    if (!form.value) { setErr(locale === "en" ? "Value is required" : locale === "tr" ? "Değer gereklidir" : locale === "fr" ? "La valeur est requise" : locale === "es" ? "El valor es obligatorio" : locale === "it" ? "Il valore è obbligatorio" : "Wert ist erforderlich"); return; }
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
    } catch (e) { setErr(e?.message || ui.error); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, width: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{locale === "en" ? "Create discount code" : locale === "tr" ? "İndirim kodu oluştur" : locale === "fr" ? "Créer un code de réduction" : locale === "es" ? "Crear código de descuento" : locale === "it" ? "Crea codice sconto" : "Rabattcode erstellen"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Code *</label>
            <input style={inp} value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="SOMMER20" />
          </div>
          <div>
            <label style={lbl}>{locale === "en" ? "Type" : locale === "tr" ? "Tür" : locale === "fr" ? "Type" : locale === "es" ? "Tipo" : locale === "it" ? "Tipo" : "Typ"}</label>
            <select style={inp} value={form.type} onChange={e => set("type", e.target.value)}>
              <option value="percentage">{locale === "en" ? "Percentage (%)" : locale === "tr" ? "Yüzde (%)" : locale === "fr" ? "Pourcentage (%)" : locale === "es" ? "Porcentaje (%)" : locale === "it" ? "Percentuale (%)" : "Prozent (%)"}</option>
              <option value="fixed">{locale === "en" ? "Fixed amount (€)" : locale === "tr" ? "Sabit tutar (€)" : locale === "fr" ? "Montant fixe (€)" : locale === "es" ? "Importe fijo (€)" : locale === "it" ? "Importo fisso (€)" : "Festbetrag (€)"}</option>
              <option value="free_shipping">{locale === "en" ? "Free shipping" : locale === "tr" ? "Ücretsiz kargo" : locale === "fr" ? "Livraison gratuite" : locale === "es" ? "Envío gratis" : locale === "it" ? "Spedizione gratuita" : "Versandkostenfrei"}</option>
            </select>
          </div>
          <div>
            <label style={lbl}>{locale === "en" ? "Value *" : locale === "tr" ? "Değer *" : locale === "fr" ? "Valeur *" : locale === "es" ? "Valor *" : locale === "it" ? "Valore *" : "Wert *"}</label>
            <input style={inp} type="number" value={form.value} onChange={e => set("value", e.target.value)} placeholder={form.type === "percentage" ? "10" : "5.00"} />
          </div>
          <div>
            <label style={lbl}>{locale === "en" ? "Min. order value (€)" : locale === "tr" ? "Min. sipariş değeri (€)" : locale === "fr" ? "Valeur min. de commande (€)" : locale === "es" ? "Valor mín. de pedido (€)" : locale === "it" ? "Valore min. ordine (€)" : "Mindestbestellwert (€)"}</label>
            <input style={inp} type="number" value={form.min_order_cents} onChange={e => set("min_order_cents", e.target.value)} placeholder="0" />
          </div>
          <div>
            <label style={lbl}>{locale === "en" ? "Max. uses" : locale === "tr" ? "Maks. kullanım" : locale === "fr" ? "Utilisations max." : locale === "es" ? "Usos máx." : locale === "it" ? "Usi massimi" : "Max. Verwendungen"}</label>
            <input style={inp} type="number" min="1" value={form.max_uses} onChange={e => set("max_uses", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>{locale === "en" ? "Valid until" : locale === "tr" ? "Geçerlilik tarihi" : locale === "fr" ? "Valide jusqu'au" : locale === "es" ? "Válido hasta" : locale === "it" ? "Valido fino al" : "Gültig bis"}</label>
            <input style={inp} type="date" value={form.expires_at} onChange={e => set("expires_at", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>{ui.notes || (locale === "en" ? "Notes" : locale === "tr" ? "Notlar" : locale === "fr" ? "Notes" : locale === "es" ? "Notas" : locale === "it" ? "Note" : "Notizen")}</label>
            <input style={inp} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>
        {err && <div style={{ margin: "0 24px 12px", color: "#ef4444", fontSize: 12 }}>{err}</div>}
        <div style={{ padding: "12px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end" }}>
          <InlineStack gap="200">
            <Button onClick={onClose}>{ui.cancel}</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {ui.create}
            </Button>
          </InlineStack>
        </div>
      </div>
    </div>
  );
}

function BonusLedgerAddModal({ open, onClose, customerId, onAdded, locale }) {
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
      setErr(locale === "en" ? "Description is required" : locale === "tr" ? "Açıklama zorunludur" : locale === "fr" ? "La description est requise" : locale === "es" ? "La descripción es obligatoria" : locale === "it" ? "La descrizione è obbligatoria" : "Beschreibung ist erforderlich");
      return;
    }
    if (!Number.isFinite(pts) || pts === 0) {
      setErr(locale === "en" ? "Points must be a non-zero integer" : locale === "tr" ? "Puan sıfırdan farklı bir tam sayı olmalıdır" : locale === "fr" ? "Les points doivent être un entier non nul" : locale === "es" ? "Los puntos deben ser un número entero distinto de cero" : locale === "it" ? "I punti devono essere un intero diverso da zero" : "Punkte müssen eine von 0 verschiedene ganze Zahl sein");
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
      setErr(e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : locale === "fr" ? "Erreur" : locale === "es" ? "Error" : locale === "it" ? "Errore" : "Fehler"));
    }
    setSaving(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={lt(locale, "Book bonus points", "Bonus puanı ekle", "Book bonus points", "Book bonus points", "Book bonus points", "Bonuspunkte buchen")}
      primaryAction={{
        content: lt(locale, "Add", "Ekle", "Add", "Add", "Add", "Hinzufügen"),
        onAction: handleAdd,
        loading: saving,
      }}
      secondaryActions={[{ content: lt(locale, "Cancel", "İptal", "Cancel", "Cancel", "Cancel", "Abbrechen"), onAction: () => !saving && onClose() }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p" tone="subdued">
            {locale === "en" ? "The booking date is automatically today. Use positive numbers to add points, negative to deduct." : locale === "tr" ? "Kayıt tarihi otomatik olarak bugündür. Puan eklemek için pozitif, düşmek için negatif sayı girin." : locale === "fr" ? "La date de réservation est automatiquement aujourd'hui. Nombres positifs pour créditer, négatifs pour débiter." : locale === "es" ? "La fecha de registro es automáticamente hoy. Números positivos para acreditar, negativos para deducir." : locale === "it" ? "La data di registrazione è automaticamente oggi. Numeri positivi per accreditare, negativi per addebitare." : "Das Buchungsdatum ist automatisch der heutige Tag. Positive Zahlen gutschreiben, negative zum Abziehen."}
          </Text>
          <TextField
            label={locale === "en" ? "Description" : locale === "tr" ? "Açıklama" : locale === "fr" ? "Description" : locale === "es" ? "Descripción" : locale === "it" ? "Descrizione" : "Beschreibung"}
            value={description}
            onChange={setDescription}
            autoComplete="off"
            placeholder={locale === "en" ? "e.g. Goodwill, correction…" : locale === "tr" ? "ör. İyi niyet, düzeltme…" : locale === "fr" ? "ex. Geste commercial, correction…" : locale === "es" ? "ej. Cortesía, corrección…" : locale === "it" ? "es. Omaggio, correzione…" : "z. B. Kulanz, Korrektur …"}
          />
          <TextField
            label={locale === "en" ? "Bonus points" : locale === "tr" ? "Bonus puanı" : locale === "fr" ? "Points bonus" : locale === "es" ? "Puntos bonus" : locale === "it" ? "Punti bonus" : "Bonuspunkte"}
            value={points}
            onChange={setPoints}
            autoComplete="off"
            placeholder={lt(locale, "+50 or −20", "+50 veya −20", "+50 or −20", "+50 or −20", "+50 or −20", "+50 oder −20")}
            helpText={locale === "en" ? "Non-zero integer" : locale === "tr" ? "Sıfırdan farklı tam sayı" : locale === "fr" ? "Entier non nul" : locale === "es" ? "Entero distinto de cero" : locale === "it" ? "Intero diverso da zero" : "Ganze Zahl, nicht 0"}
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
  const id = params?.id;
  const locale = useLocale();
  const ui = getUI(locale);

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showBonusLedgerModal, setShowBonusLedgerModal] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [returnsMap, setReturnsMap] = useState({});
  const [reviews, setReviews] = useState([]);
  const [editCustomerModal, setEditCustomerModal] = useState(false);

  const loadCustomer = async () => {
    try {
      const client = getMedusaAdminClient();
      const [res, returnsData, reviewsData] = await Promise.all([
        client.getCustomerById(id),
        client.getReturns().catch(() => ({ returns: [] })),
        client.request("/admin-hub/reviews").catch(() => ({ reviews: [] })),
      ]);
      setCustomer(res?.customer || null);
      setNotesVal(res?.customer?.notes || "");
      setBonusVal(String(res?.customer?.bonus_points || 0));
      const map = {};
      for (const r of (returnsData?.returns || [])) {
        if (r.order_id && r.status !== "abgelehnt" && r.status !== "abgeschlossen") {
          map[r.order_id] = true;
        }
      }
      setReturnsMap(map);
      const email = res?.customer?.email;
      const orderIds = new Set((res?.customer?.orders || []).map(o => o.id));
      setReviews((reviewsData?.reviews || []).filter(r =>
        orderIds.has(r.order_id) ||
        r.customer_email === email ||
        r.customer_id === id
      ));
    } catch (e) {
      setError(e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : locale === "fr" ? "Erreur" : locale === "es" ? "Error" : locale === "it" ? "Errore" : "Fehler"));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    loadCustomer();
  }, [id]);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);

  const orders = customer?.orders || [];
  const discounts = customer?.discounts || [];
  const bonusLedger = Array.isArray(customer?.bonus_ledger) ? customer.bonus_ledger : [];
  const bonusSummary = customer?.bonus_summary || null;
  const totalSpent = orders.reduce((s, o) => s + Number(o.total_cents || 0), 0);
  const avgOrder = orders.length > 0 ? totalSpent / orders.length : 0;
  const firstOrder = orders.length > 0 ? orders[orders.length - 1]?.created_at : null;
  const lastOrder = orders.length > 0 ? orders[0]?.created_at : null;

  const fullName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || customer?.email || "—";

  const accountTypeLabel = () => {
    if (customer?.account_type === "gastkunde") return ui.guestCustomer;
    if (customer?.account_type === "gewerbe") return ui.businessCustomer;
    return ui.privateCustomer;
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

  // Balance is never set directly (BonusPunkte.md §3.3 — every change must be an audited ledger
  // row, or the balance and the ledger silently drift apart). The stat tile's "edit" action opens
  // the ledger "add entry" modal instead; see the ledger card below for the corresponding backend
  // call (POST .../bonus-ledger, which updates store_customers.bonus_points itself).

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
  };

  // Bonus-ledger entries are append-only (BonusPunkte.md §3.3) — the backend rejects PATCH/DELETE
  // outright, so there is no edit handler here. Corrections go through the "add entry" modal above
  // with an offsetting points_delta (e.g. description "Korrektur").

  // --- Billing address: prefer stored customer billing address, fallback to last order billing ---
  const billingFromOrders = orders.find(o => o.billing_address_line1);
  const hasStoredBilling = customer?.billing_address_line1 || customer?.billing_city;

  return (
    <div style={{ padding: 24, maxWidth: 1320, margin: "0 auto", boxSizing: "border-box" }}>
      {isSuperuser && showDiscountModal && (
        <DiscountModal
          customerId={id}
          onClose={() => setShowDiscountModal(false)}
          onAdded={() => { loadCustomer(); }}
          ui={ui}
          locale={locale}
        />
      )}
      {isSuperuser && (
        <BonusLedgerAddModal
          open={showBonusLedgerModal}
          onClose={() => setShowBonusLedgerModal(false)}
          customerId={id}
          onAdded={handleBonusLedgerAdded}
          locale={locale}
        />
      )}
      {isSuperuser && editCustomerModal && customer && (
        <CustomerFormModal
          initial={customer}
          onClose={() => setEditCustomerModal(false)}
          onSave={async (form) => {
            const client = getMedusaAdminClient();
            await client.updateCustomer(id, form);
            await loadCustomer();
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <div style={{ flexShrink: 0, marginTop: 4 }}>
          <Button onClick={() => router.push("/customers")}>← {ui.customers}</Button>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
              {loading ? ui.loading : fullName}
            </h1>
            {customer && isSuperuser && (
              <>
                {customer.is_registered ? (
                  <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: "#d1fae5", color: "#065f46", fontWeight: 600 }}>{lt(locale, "Registered", "Kayıtlı", "Registered", "Registered", "Registered", "Registriert")}</span>
                ) : (
                  <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280", fontWeight: 600 }}>{ui.guestCustomer}</span>
                )}
                {customer.newsletter_opted_in && (
                  <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: "#ede9fe", color: "#6d28d9", fontWeight: 600 }}>Newsletter</span>
                )}
              </>
            )}
          </div>
          {isSuperuser && customer?.customer_number && (
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 3 }}>
              #{customer.customer_number}{customer.email ? ` · ${customer.email}` : ""}
            </div>
          )}
        </div>
        {customer && isSuperuser && (
          <button
            type="button"
            onClick={() => setEditCustomerModal(true)}
            style={{ padding: "7px 16px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, cursor: "pointer", background: "#fff", flexShrink: 0 }}
          >
            {ui.edit}
          </button>
        )}
      </div>

      {loading && (
        <div style={{ padding: 60, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>{ui.loading}</div>
      )}
      {!loading && error && (
        <div style={{ padding: 40, textAlign: "center", color: "#ef4444", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>{error}</div>
      )}

      {!loading && !error && customer && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(400px, 440px)", gap: 20, alignItems: "start" }}>
          {/* LEFT COLUMN */}
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: isSuperuser ? "repeat(4, 1fr)" : "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: ui.totalSpent, value: fmtCents(totalSpent, locale), icon: "💰" },
                { label: ui.orders, value: orders.length, icon: "📦" },
                { label: lt(locale, "Avg. order", "Ort. sipariş", "Avg. order", "Avg. order", "Avg. order", "Ø Bestellwert"), value: fmtCents(avgOrder, locale), icon: "📊" },
                ...(isSuperuser ? [{ label: lt(locale, "Bonus points", "Bonus puanı", "Bonus points", "Bonus points", "Bonus points", "Bonuspunkte"), value: customer.bonus_points ?? 0, icon: "⭐", editable: true, onEdit: () => setShowBonusLedgerModal(true) }] : []),
              ].map((s, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    {s.editable && (
                      <Button variant="plain" size="micro" onClick={s.onEdit}>
                        {ui.edit}
                      </Button>
                    )}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Order history */}
            <Card title={`${lt(locale, "Order history", "Sipariş geçmişi", "Order history", "Order history", "Order history", "Bestellhistorie")} (${orders.length})`}>
              {orders.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af", padding: "12px 0" }}>{ui.noOrders}</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                  <thead>
                    <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>{ui.colNumber}</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>{ui.colOrderStatus}</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>{ui.colPaymentStatus}</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>{ui.colDeliveryStatus}</th>
                      <th style={{ textAlign: "right", padding: "4px 0 10px" }}>{ui.colAmount}</th>
                      <th style={{ textAlign: "right", padding: "4px 0 10px" }}>{ui.colDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                        onClick={() => router.push(`/orders/${o.id}`)}
                        onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}
                      >
                        <td style={{ padding: "9px 0", fontWeight: 600, color: "#202223" }}>#{o.order_number || "—"}</td>
                        <td style={{ padding: "9px 0" }}>
                          {returnsMap[o.id] ? (
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fef2f2", color: "#b91c1c", fontWeight: 600 }}>{ui.retoure}</span>
                          ) : (
                            <StatusBadge value={o.order_status} />
                          )}
                        </td>
                        <td style={{ padding: "9px 0" }}><StatusBadge value={o.payment_status} /></td>
                        <td style={{ padding: "9px 0" }}><StatusBadge value={o.delivery_status} /></td>
                        <td style={{ padding: "9px 0", textAlign: "right", fontWeight: 600 }}>{fmtCents(o.total_cents, locale)}</td>
                        <td style={{ padding: "9px 0", textAlign: "right", color: "#6b7280", fontSize: 12 }}>{fmtDateShort(o.created_at, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Reviews */}
            <Card title={`${ui.reviewsTitle} (${reviews.length})`}>
              {reviews.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af", padding: "12px 0" }}>{ui.noReviews}</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                  <thead>
                    <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>SKU / {ui.colProduct}</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>{ui.colRating}</th>
                      <th style={{ textAlign: "left", padding: "4px 0 10px" }}>{lt(locale, "Comment", "Yorum", "Comment", "Comment", "Comment", "Kommentar")}</th>
                      <th style={{ textAlign: "right", padding: "4px 0 10px" }}>{ui.colDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "9px 0", color: "#374151" }}>{r.product_sku || r.product_title || r.product_id || "—"}</td>
                        <td style={{ padding: "9px 0" }}>
                          <span style={{ color: "#f59e0b", letterSpacing: 1 }}>{"★".repeat(r.rating || 0)}{"☆".repeat(5 - (r.rating || 0))}</span>
                        </td>
                        <td style={{ padding: "9px 0", color: "#6b7280", maxWidth: 300 }}>{r.comment || "—"}</td>
                        <td style={{ padding: "9px 0", textAlign: "right", color: "#6b7280", fontSize: 12 }}>{fmtDateShort(r.created_at, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {isSuperuser && (
              <>
                {/* Discounts */}
                <Card
                  title={lt(locale, "Discounts & Coupons", "İndirimler & Kuponlar", "Discounts & Coupons", "Discounts & Coupons", "Discounts & Coupons", "Rabatte & Gutscheine")}
                  action={
                    <Button size="slim" variant="primary" onClick={() => setShowDiscountModal(true)}>
                      {ui.add}
                    </Button>
                  }
                >
                  {discounts.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#9ca3af", padding: "12px 0" }}>{ui.noResults}</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                      <thead>
                        <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                          <th style={{ textAlign: "left", padding: "4px 0 10px" }}>Code</th>
                          <th style={{ textAlign: "left", padding: "4px 0 10px" }}>{ui.colType}</th>
                          <th style={{ textAlign: "right", padding: "4px 0 10px" }}>{lt(locale, "Value", "Değer", "Value", "Value", "Value", "Wert")}</th>
                          <th style={{ textAlign: "right", padding: "4px 0 10px" }}>{lt(locale, "Uses", "Kullanım", "Uses", "Uses", "Uses", "Nutzungen")}</th>
                          <th style={{ textAlign: "right", padding: "4px 0 10px" }}>{lt(locale, "Valid until", "Geçerlilik", "Valid until", "Valid until", "Valid until", "Gültig bis")}</th>
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
                              <td style={{ padding: "8px 0", color: "#6b7280" }}>{d.type === "percentage" ? "%" : d.type === "fixed" ? (lt(locale, "Fixed", "Sabit", "Fixed", "Fixed", "Fixed", "Fest")) : ui.shipping}</td>
                              <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>
                                {d.type === "percentage" ? `${d.value}%` : d.type === "fixed" ? `${Number(d.value).toFixed(2)} €` : "—"}
                              </td>
                              <td style={{ padding: "8px 0", textAlign: "right", color: "#6b7280" }}>{d.used_count}/{d.max_uses}</td>
                              <td style={{ padding: "8px 0", textAlign: "right", fontSize: 12, color: isExpired ? "#ef4444" : "#6b7280" }}>
                                {d.expires_at ? fmtDateShort(d.expires_at, locale) : "—"}
                              </td>
                              <td style={{ padding: "8px 0", textAlign: "right" }}>
                                <button type="button" onClick={() => handleDeleteDiscount(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12 }}>{ui.delete}</button>
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
                  title={ui.notes}
                  action={!editNotes && (
                    <Button size="slim" onClick={() => setEditNotes(true)}>
                      {ui.edit}
                    </Button>
                  )}
                >
                  {editNotes ? (
                    <div style={{ paddingTop: 8 }}>
                      <textarea
                        value={notesVal}
                        onChange={e => setNotesVal(e.target.value)}
                        style={{ width: "100%", height: 100, padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                        placeholder={lt(locale, "Internal notes about the customer…", "Müşteri hakkında dahili notlar…", "Internal notes about the customer…", "Internal notes about the customer…", "Internal notes about the customer…", "Interne Notizen zum Kunden…")}
                        autoFocus
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <Button variant="primary" onClick={handleSaveNotes} disabled={savingNotes} loading={savingNotes}>
                          {ui.save}
                        </Button>
                        <Button onClick={() => { setEditNotes(false); setNotesVal(customer?.notes || ""); }}>
                          {ui.cancel}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: notesVal ? "#111827" : "#9ca3af", margin: "10px 0 4px", whiteSpace: "pre-wrap" }}>
                      {notesVal || (lt(locale, "No notes", "Not yok", "No notes", "No notes", "No notes", "Keine Notizen"))}
                    </p>
                  )}
                </Card>
              </>
            )}

            {/* Bonus ledger (superuser only) */}
            {isSuperuser && (
            <Card
              title={lt(locale, "Bonus points — History", "Bonus puanları — Geçmiş", "Bonus points — History", "Bonus points — History", "Bonus points — History", "Bonuspunkte — Verlauf")}
              action={
                <Button size="slim" variant="primary" onClick={() => setShowBonusLedgerModal(true)}>
                  {ui.add}
                </Button>
              }
            >
              {bonusSummary && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: lt(locale, "Balance", "Bakiye", "Balance", "Balance", "Balance", "Guthaben"), value: `${bonusSummary.balance_points} Pkt.`, sub: fmtCents(bonusSummary.balance_eur_cents, locale) },
                    { label: lt(locale, "Earned (total)", "Kazanılan (toplam)", "Earned (total)", "Earned (total)", "Earned (total)", "Verdient (gesamt)"), value: `+${bonusSummary.earned_points} Pkt.`, color: "#065f46" },
                    { label: lt(locale, "Redeemed (total)", "Kullanılan (toplam)", "Redeemed (total)", "Redeemed (total)", "Redeemed (total)", "Eingelöst (gesamt)"), value: `-${bonusSummary.redeemed_points} Pkt.`, color: "#991b1b" },
                    { label: lt(locale, "Reversed (net)", "Ters kayıt (net)", "Reversed (net)", "Reversed (net)", "Reversed (net)", "Storniert (netto)"), value: `${bonusSummary.reversed_points > 0 ? "+" : ""}${bonusSummary.reversed_points} Pkt.`, color: bonusSummary.reversed_points >= 0 ? "#065f46" : "#991b1b" },
                  ].map((s) => (
                    <div key={s.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>{s.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: s.color || "#111827" }}>{s.value}</div>
                      {s.sub && <div style={{ fontSize: 12, color: "#9ca3af" }}>{s.sub}</div>}
                    </div>
                  ))}
                </div>
              )}
              {bonusLedger.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af", padding: "8px 0" }}>{lt(locale, "No ledger entries yet.", "Henüz kayıt yok.", "No ledger entries yet.", "No ledger entries yet.", "No ledger entries yet.", "Noch keine Einträge im Verlauf.")}</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                        <th style={{ textAlign: "left", padding: "6px 8px 10px", width: 110 }}>{ui.colDate}</th>
                        <th style={{ textAlign: "left", padding: "6px 8px 10px" }}>{ui.colDescription}</th>
                        <th style={{ textAlign: "right", padding: "6px 8px 10px", width: 100 }}>{lt(locale, "Bonus points", "Bonus puan", "Bonus points", "Bonus points", "Bonus points", "Bonuspunkte")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonusLedger.map((row) => (
                        <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6", verticalAlign: "top" }}>
                          <td style={{ padding: "10px 8px", whiteSpace: "nowrap", color: "#6b7280", fontSize: 12 }}>
                            {fmtDateShort(row.occurred_at, locale)}
                          </td>
                          <td style={{ padding: "10px 8px", minWidth: 180 }}>
                            <div>
                              <span style={{ color: "#111827" }}>{row.description}</span>
                              {row.source && row.source !== "manual" && (
                                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{bonusSourceLabel(row.source, locale)}</div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: row.points_delta >= 0 ? "#065f46" : "#991b1b" }}>
                            {`${row.points_delta > 0 ? "+" : ""}${row.points_delta}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            )}

          </div>

          {/* RIGHT COLUMN */}
          <div>
            {/* Customer info */}
            <Card title={lt(locale, "Customer Profile", "Müşteri Profili", "Customer Profile", "Customer Profile", "Customer Profile", "Kundenprofil")}>
              <InfoRow label={ui.firstName} value={customer.first_name} />
              <InfoRow label={ui.lastName} value={customer.last_name} />
              {isSuperuser && <InfoRow label={ui.colEmail} value={customer.email} />}
              {isSuperuser && <InfoRow label={ui.phone} value={customer.phone} />}
              {customer.gender && <InfoRow label={lt(locale, "Gender", "Cinsiyet", "Gender", "Gender", "Gender", "Geschlecht")} value={customer.gender === "male" ? (lt(locale, "Male", "Erkek", "Male", "Male", "Male", "Männlich")) : customer.gender === "female" ? (lt(locale, "Female", "Kadın", "Female", "Female", "Female", "Weiblich")) : customer.gender} />}
              {isSuperuser && customer.birth_date && <InfoRow label={lt(locale, "Date of birth", "Doğum tarihi", "Date of birth", "Date of birth", "Date of birth", "Geburtsdatum")} value={fmtBirthDate(customer.birth_date, locale)} />}
              {isSuperuser && <InfoRow label={ui.accountType} value={accountTypeLabel()} />}
              {isSuperuser && <InfoRow label={lt(locale, "Account", "Hesap", "Account", "Account", "Account", "Konto")} value={customer.is_registered ? (lt(locale, "Registered", "Kayıtlı", "Registered", "Registered", "Registered", "Registriert")) : ui.guestCustomer} />}
              {isSuperuser && <InfoRow label="Newsletter" value={customer.newsletter_opted_in ? (lt(locale, "✓ Subscribed", "✓ Abone", "✓ Subscribed", "✓ Subscribed", "✓ Subscribed", "✓ Abonniert")) : (lt(locale, "Not subscribed", "Abone değil", "Not subscribed", "Not subscribed", "Not subscribed", "Nicht abonniert"))} />}
              {isSuperuser && customer.email_marketing_consent && <InfoRow label={lt(locale, "Marketing email", "Pazarlama e-postası", "Marketing email", "Marketing email", "Marketing email", "Marketing E-Mail")} value={lt(locale, "Consented", "Onaylandı", "Consented", "Consented", "Consented", "Zugestimmt")} />}
              {customer.account_type === "gewerbe" && (
                <>
                  <InfoRow label={ui.companyName} value={customer.company_name} />
                  <InfoRow label="USt-IdNr." value={customer.vat_number} mono />
                </>
              )}
              {isSuperuser && <InfoRow label={lt(locale, "Customer no.", "Müşteri no.", "Customer no.", "Customer no.", "Customer no.", "Kundennummer")} value={customer.customer_number ? `#${customer.customer_number}` : "—"} />}
              {isSuperuser && <InfoRow label={lt(locale, "Created on", "Oluşturulma", "Created on", "Created on", "Created on", "Erstellt am")} value={fmtDateShort(customer.created_at, locale)} />}
              {isSuperuser && <InfoRow label={lt(locale, "First order", "İlk sipariş", "First order", "First order", "First order", "Erste Bestellung")} value={fmtDateShort(firstOrder, locale)} />}
              {isSuperuser && <InfoRow label={ui.lastOrder} value={fmtDateShort(lastOrder, locale)} />}
            </Card>

            {/* Delivery address */}
            <Card title={lt(locale, "Delivery address", "Teslimat adresi", "Delivery address", "Delivery address", "Delivery address", "Lieferadresse")}>
              <AddressBlock
                label=""
                line1={customer.address_line1}
                line2={customer.address_line2}
                zip={customer.zip_code}
                city={customer.city}
                country={customer.country}
              />
              {!customer.address_line1 && !customer.city && (
                <p style={{ fontSize: 13, color: "#9ca3af", margin: "10px 0 4px" }}>{lt(locale, "No delivery address", "Teslimat adresi yok", "No delivery address", "No delivery address", "No delivery address", "Keine Lieferadresse")}</p>
              )}
            </Card>

            {/* Billing address */}
            <Card title={lt(locale, "Billing address", "Fatura adresi", "Billing address", "Billing address", "Billing address", "Rechnungsadresse")}>
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
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>{locale === "en" ? "From last order" : locale === "tr" ? "Son siparişten" : locale === "fr" ? "Dernière commande" : locale === "es" ? "Del último pedido" : locale === "it" ? "Dall'ultimo ordine" : "Aus letzter Bestellung"}</p>
                </>
              ) : (customer.address_line1 || customer.city) ? (
                <p style={{ fontSize: 13, color: "#6b7280", margin: "10px 0 4px", lineHeight: 1.5 }}>
                  {lt(locale, "Same as delivery address (no separate billing address).", "Teslimat adresiyle aynı (ayrı fatura adresi yok).", "Same as delivery address (no separate billing address).", "Same as delivery address (no separate billing address).", "Same as delivery address (no separate billing address).", "Entspricht der Lieferadresse (keine abweichende Rechnungsadresse).")}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "#9ca3af", margin: "10px 0 4px" }}>
                  {lt(locale, "No billing address on file.", "Kayıtlı fatura adresi yok.", "No billing address on file.", "No billing address on file.", "No billing address on file.", "Keine Rechnungsadresse hinterlegt.")}
                </p>
              )}
            </Card>

            {/* Timeline */}
            {isSuperuser && (
            <Card title={lt(locale, "Activity", "Aktivite", "Activity", "Activity", "Activity", "Aktivität")}>
              <div style={{ paddingTop: 8 }}>
                {[
                  customer.created_at && { date: customer.created_at, text: lt(locale, "Customer created", "Müşteri oluşturuldu", "Customer created", "Customer created", "Customer created", "Kunde erstellt") },
                  firstOrder && { date: firstOrder, text: lt(locale, "First order", "İlk sipariş", "First order", "First order", "First order", "Erste Bestellung") },
                  orders.length > 1 && lastOrder && { date: lastOrder, text: lt(locale, "Last order", "Son sipariş", "Last order", "Last order", "Last order", "Letzte Bestellung") },
                ].filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date)).map((ev, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#008060", marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.text}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{fmtDateShort(ev.date, locale)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
