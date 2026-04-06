"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  TextField,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { CustomerFormModal } from "@/components/CustomerFormModal";

function fmtCents(c) {
  return (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function accountTypeLabel(type) {
  if (type === "gastkunde") return "Gast";
  if (type === "gewerbe") return "Gewerbe";
  return "Privat";
}

const ACCOUNT_TYPE_COLORS = {
  gastkunde: { bg: "#f3f4f6", color: "#6b7280" },
  gewerbe:   { bg: "#dbeafe", color: "#1e40af" },
  privat:    { bg: "#d1fae5", color: "#065f46" },
};

function ActionMenu({ customer, onEdit, onDelete, canManage }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, bottom: "auto", right: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < 120;
      setPos({
        top: openUp ? "auto" : rect.bottom + 4,
        bottom: openUp ? (window.innerHeight - rect.top + 4) : "auto",
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(o => !o);
  };

  if (!canManage) {
    return <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>;
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        ref={btnRef}
        onClick={handleToggle}
        style={{ background: "none", border: "1px solid transparent", borderRadius: 5, padding: "3px 7px", cursor: "pointer", fontSize: 16, color: "#6b7280", lineHeight: 1 }}
        onMouseEnter={e => e.currentTarget.style.background = "#f3f4f6"}
        onMouseLeave={e => e.currentTarget.style.background = "none"}
      >
        ···
      </button>
      {open && (
        <div ref={menuRef} style={{ position: "fixed", top: pos.top, bottom: pos.bottom, right: pos.right, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 9999, minWidth: 150, overflow: "hidden" }}>
          <button
            onClick={() => { setOpen(false); onEdit(customer); }}
            style={{ display: "block", width: "100%", padding: "9px 16px", textAlign: "left", background: "none", border: "none", fontSize: 13, cursor: "pointer", color: "#111827" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
            Bearbeiten
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(customer); }}
            style={{ display: "block", width: "100%", padding: "9px 16px", textAlign: "left", background: "none", border: "none", fontSize: 13, cursor: "pointer", color: "#ef4444" }}
            onMouseEnter={e => e.currentTarget.style.background = "#fef2f2"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
            Löschen
          </button>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  const router = useRouter();



  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | { mode: "create" } | { mode: "edit", customer }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const searchDebounceRef = useRef(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);

  const fetchCustomers = useCallback(async (q) => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const p = {};
      if (q) p.search = q;
      const data = await client.getCustomers(p);
      setCustomers(data.customers || []);
    } catch {
      setCustomers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers("");
  }, [fetchCustomers]);

  const onSearchChange = useCallback(
    (val) => {
      setSearch(val);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => fetchCustomers(val), 400);
    },
    [fetchCustomers]
  );

  const handleSaveCustomer = async (form) => {
    const client = getMedusaAdminClient();
    if (modal?.mode === "edit" && modal.customer?.id) {
      const res = await client.updateCustomer(modal.customer.id, form);
      const updated = res?.customer;
      if (updated) setCustomers(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
    } else {
      const res = await client.createCustomer(form);
      const created = res?.customer;
      if (created) setCustomers(prev => [created, ...prev]);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    try {
      const client = getMedusaAdminClient();
      await client.deleteCustomer(confirmDelete.id);
      setCustomers(prev => prev.filter(c => c.id !== confirmDelete.id));
    } catch (e) {
      alert(e?.message || "Kunde konnte nicht gelöscht werden. Bitte Konsole/Netzwerk prüfen.");
    }
    setConfirmDelete(null);
  };

  const COLS = ["Kundennr.", "Name", "Email", "Typ", "Registriert", "Newsletter", "Land", "Bestellungen", "Gesamtumsatz", "Letzter Kauf", ""];

  return (
    <Page
      title="Kunden"
      primaryAction={{
        content: "Neuer Kunde",
        onAction: () => setModal({ mode: "create" }),
      }}
    >
      {/* Modals */}
      {modal && (
        <CustomerFormModal
          initial={modal.mode === "edit" ? modal.customer : null}
          onClose={() => setModal(null)}
          onSave={handleSaveCustomer}
        />
      )}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>Kunde löschen?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
              {[confirmDelete.first_name, confirmDelete.last_name].filter(Boolean).join(" ") || confirmDelete.email} wird dauerhaft gelöscht.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, cursor: "pointer", background: "#fff" }}>Abbrechen</button>
              <button onClick={handleDeleteConfirm} style={{ padding: "8px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingSm">
                  Alle Kunden
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {customers.length} {customers.length === 1 ? "Kunde" : "Kunden"}
                </Text>
              </InlineStack>
              <Box maxWidth="400px">
                <TextField
                  label="Suche"
                  labelHidden
                  placeholder="Suche nach Name, Email oder #Kundennr…"
                  value={search}
                  onChange={onSearchChange}
                  autoComplete="off"
                />
              </Box>
              <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {COLS.map((c, i) => (
                <th key={i} style={{ padding: "10px 12px", textAlign: i >= 7 && i <= 9 ? "center" : "left", fontWeight: 600, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Laden…</td></tr>
            )}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: "60px 20px", textAlign: "center", color: "#9ca3af" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
                  <div>Keine Kunden gefunden</div>
                </td>
              </tr>
            )}
            {customers.map((c, i) => {
              const typeColor = ACCOUNT_TYPE_COLORS[c.account_type] || ACCOUNT_TYPE_COLORS.privat;
              return (
                <tr
                  key={i}
                  style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                  onClick={() => router.push(`/${locale}/customers/${c.id}`)}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "#6b7280", fontSize: 12 }}>
                    {c.customer_number ? `#${c.customer_number}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{isSuperuser ? c.email : "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: typeColor.bg, color: typeColor.color, fontWeight: 600 }}>
                      {accountTypeLabel(c.account_type)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {c.is_registered ? (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#d1fae5", color: "#065f46", fontWeight: 600 }}>Registriert</span>
                    ) : (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280", fontWeight: 600 }}>Gast</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {c.newsletter_opted_in ? (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#ede9fe", color: "#6d28d9", fontWeight: 600 }}>✓ Abonniert</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{c.country || "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600 }}>{c.order_count || 0}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600 }}>{fmtCents(c.total_spent)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, color: "#6b7280" }}>{fmtDate(c.last_order)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    <ActionMenu
                      customer={c}
                      canManage={isSuperuser}
                      onEdit={(cust) => setModal({ mode: "edit", customer: cust })}
                      onDelete={(cust) => setConfirmDelete(cust)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
