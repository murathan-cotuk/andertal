"use client";

import React, { useState, useEffect } from "react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Badge, Banner, Box, TextField, Modal, Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// All available menu routes with labels
const ALL_PERMISSIONS = [
  { group: "Genel", items: [
    { key: "/dashboard", label: "Dashboard" },
    { key: "/inbox", label: "Nachrichten" },
  ]},
  { group: "Bestellungen", items: [
    { key: "/orders", label: "Bestellungen" },
    { key: "/orders/returns", label: "Retouren" },
  ]},
  { group: "Produkte", items: [
    { key: "/products", label: "Produkte" },
    { key: "/products/inventory", label: "Inventar" },
    { key: "/products/gift-cards", label: "Geschenkkarten" },
  ]},
  { group: "Kunden", items: [
    { key: "/customers", label: "Kundenliste" },
    { key: "/customers/reviews", label: "Bewertungen" },
  ]},
  { group: "Marketing & Rabatte", items: [
    { key: "/marketing", label: "Marketing" },
    { key: "/discounts", label: "Rabatte" },
  ]},
  { group: "Content", items: [
    { key: "/content/media", label: "Medien" },
    { key: "/content/brands", label: "Marken" },
    { key: "/content/metaobjects", label: "Metaobjekte" },
  ]},
  { group: "Analytics", items: [
    { key: "/analytics/reports", label: "Berichte" },
    { key: "/analytics/transactions", label: "Transaktionen" },
  ]},
  { group: "Einstellungen", items: [
    { key: "/settings", label: "Einstellungen" },
    { key: "/settings/payments", label: "Zahlungen & IBAN" },
    { key: "/settings/users-permissions", label: "Benutzer & Rechte" },
  ]},
];

const DEFAULT_PERMS = [
  "/dashboard", "/inbox", "/orders", "/orders/returns", "/products", "/products/inventory",
  "/products/gift-cards", "/customers", "/customers/reviews", "/marketing", "/discounts",
  "/content/media", "/content/brands", "/content/metaobjects",
  "/analytics/reports", "/analytics/transactions", "/settings", "/settings/payments",
];

function PermissionsSelector({ value, onChange }) {
  const allowed = value || DEFAULT_PERMS;
  const toggle = (key) => {
    if (allowed.includes(key)) onChange(allowed.filter((k) => k !== key));
    else onChange([...allowed, key]);
  };
  const toggleGroup = (items) => {
    const keys = items.map((i) => i.key);
    const allOn = keys.every((k) => allowed.includes(k));
    if (allOn) onChange(allowed.filter((k) => !keys.includes(k)));
    else onChange([...new Set([...allowed, ...keys])]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ALL_PERMISSIONS.map((group) => {
        const allOn = group.items.every((i) => allowed.includes(i.key));
        return (
          <div key={group.group}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Checkbox
                label={<span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{group.group}</span>}
                checked={allOn}
                onChange={() => toggleGroup(group.items)}
              />
            </div>
            <div style={{ paddingLeft: 24, display: "flex", flexDirection: "column", gap: 4 }}>
              {group.items.map((item) => (
                <Checkbox
                  key={item.key}
                  label={<span style={{ fontSize: 13, color: "#4b5563" }}>{item.label}</span>}
                  checked={allowed.includes(item.key)}
                  onChange={() => toggle(item.key)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Invite Modal (for sellers) ────────────────────────────────────────────────
function InviteModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    permissions: DEFAULT_PERMS,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSend = async () => {
    if (!form.email.trim()) { setErr("E-Mail ist ein Pflichtfeld"); return; }
    if (!form.first_name.trim() || !form.last_name.trim()) { setErr("Vor- und Nachname sind Pflichtfelder"); return; }
    setSaving(true); setErr("");
    try {
      await getMedusaAdminClient().inviteUser({
        email: form.email.trim().toLowerCase(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        permissions: form.permissions,
      });
      onSaved();
    } catch (e) {
      setErr(e?.message || "Fehler beim Senden der Einladung");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Benutzer einladen"
      primaryAction={{ content: "Einladung senden", onAction: handleSend, loading: saving }}
      secondaryActions={[{ content: "Abbrechen", onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <TextField label="Vorname *" value={form.first_name}
              onChange={(v) => set("first_name", v)} autoComplete="off" />
            <TextField label="Nachname *" value={form.last_name}
              onChange={(v) => set("last_name", v)} autoComplete="off" />
          </div>
          <TextField label="E-Mail *" type="email" value={form.email}
            onChange={(v) => set("email", v)} autoComplete="off" />
          <div>
            <Text variant="headingSm" as="h3">Zugriffsrechte</Text>
            <Box paddingBlockStart="300">
              <PermissionsSelector
                value={form.permissions}
                onChange={(v) => set("permissions", v)}
              />
            </Box>
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Edit Permissions Modal (for sellers, editing existing sub-user) ────────────
function EditPermissionsModal({ user, onClose, onSaved }) {
  const [permissions, setPermissions] = useState(user.permissions || DEFAULT_PERMS);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await getMedusaAdminClient().updateSubuser(user.id, { permissions });
      onSaved();
    } catch (e) {
      setErr(e?.message || "Fehler");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Rechte bearbeiten — ${user.first_name || ""} ${user.last_name || ""} (${user.email})`}
      primaryAction={{ content: "Speichern", onAction: handleSave, loading: saving }}
      secondaryActions={[{ content: "Abbrechen", onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}
          <PermissionsSelector value={permissions} onChange={setPermissions} />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Superuser full management modal ──────────────────────────────────────────
const ALL_PERMISSIONS_SUPER = [
  { group: "Genel", items: [
    { key: "/dashboard", label: "Dashboard" },
    { key: "/inbox", label: "Posteingang / Nachrichten" },
  ]},
  { group: "Bestellungen", items: [
    { key: "/orders", label: "Bestellungen (Ansicht)" },
    { key: "/orders/returns", label: "Retouren" },
    { key: "/orders/abandoned-checkouts", label: "Abgebrochene Checkouts" },
  ]},
  { group: "Produkte", items: [
    { key: "/products", label: "Produkte" },
    { key: "/products/inventory", label: "Inventar" },
    { key: "/products/collections", label: "Kollektionen" },
    { key: "/products/gift-cards", label: "Geschenkkarten" },
  ]},
  { group: "Kunden", items: [
    { key: "/customers", label: "Kundenliste" },
    { key: "/customers/reviews", label: "Bewertungen" },
  ]},
  { group: "Marketing & Rabatte", items: [
    { key: "/marketing", label: "Marketing" },
    { key: "/discounts", label: "Rabatte" },
  ]},
  { group: "Content", items: [
    { key: "/content/media", label: "Medien" },
    { key: "/content/menus", label: "Menüs" },
    { key: "/content/categories", label: "Kategorien" },
    { key: "/content/landing-page", label: "Landing Page" },
    { key: "/content/styles", label: "Styles" },
    { key: "/content/pages", label: "Seiten" },
    { key: "/content/blog-posts", label: "Blog-Beiträge" },
    { key: "/content/brands", label: "Marken" },
    { key: "/content/metaobjects", label: "Metaobjekte" },
  ]},
  { group: "Analytics", items: [
    { key: "/analytics/reports", label: "Berichte" },
    { key: "/analytics/transactions", label: "Transaktionen" },
    { key: "/analytics/live-view", label: "Live-Ansicht" },
  ]},
  { group: "Einstellungen", items: [
    { key: "/settings", label: "Einstellungen (allgemein)" },
    { key: "/settings/payments", label: "Zahlungen & IBAN" },
    { key: "/settings/users-permissions", label: "Benutzer & Rechte" },
  ]},
];

const DEFAULT_SELLER_PERMS = [
  "/dashboard", "/inbox", "/orders", "/orders/returns", "/products", "/products/inventory",
  "/products/gift-cards", "/customers", "/customers/reviews", "/marketing", "/discounts",
  "/content/media", "/content/brands", "/content/metaobjects",
  "/analytics/reports", "/analytics/transactions", "/settings", "/settings/payments",
];

function PermissionsSelectorFull({ value, onChange, isSuperuserTarget }) {
  const allowed = value || DEFAULT_SELLER_PERMS;
  const toggle = (key) => {
    if (allowed.includes(key)) onChange(allowed.filter((k) => k !== key));
    else onChange([...allowed, key]);
  };
  const toggleGroup = (items) => {
    const keys = items.map((i) => i.key);
    const allOn = keys.every((k) => allowed.includes(k));
    if (allOn) onChange(allowed.filter((k) => !keys.includes(k)));
    else onChange([...new Set([...allowed, ...keys])]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ALL_PERMISSIONS_SUPER.map((group) => {
        const allOn = group.items.every((i) => allowed.includes(i.key));
        return (
          <div key={group.group}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Checkbox
                label={<span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{group.group}</span>}
                checked={allOn}
                onChange={() => toggleGroup(group.items)}
              />
            </div>
            <div style={{ paddingLeft: 24, display: "flex", flexDirection: "column", gap: 4 }}>
              {group.items.map((item) => (
                <Checkbox
                  key={item.key}
                  label={<span style={{ fontSize: 13, color: "#4b5563" }}>{item.label}</span>}
                  checked={allowed.includes(item.key)}
                  onChange={() => toggle(item.key)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SuperUserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?.id;
  const [form, setForm] = useState({
    store_name: user?.store_name || "",
    email: user?.email || "",
    password: "",
    is_superuser: user?.is_superuser || false,
    permissions: user?.permissions || DEFAULT_SELLER_PERMS,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!isEdit && (!form.email.trim() || !form.password.trim())) {
      setErr("E-Mail und Passwort sind Pflichtfelder"); return;
    }
    setSaving(true); setErr("");
    try {
      const data = {
        store_name: form.store_name,
        is_superuser: form.is_superuser,
        permissions: form.is_superuser ? null : form.permissions,
      };
      if (isEdit) {
        if (form.password) data.password = form.password;
        await getMedusaAdminClient().updateSellerUser(user.id, data);
      } else {
        data.email = form.email.trim().toLowerCase();
        data.password = form.password;
        await getMedusaAdminClient().createSellerUser(data);
      }
      onSaved();
    } catch (e) {
      setErr(e?.message || "Fehler");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Benutzer bearbeiten — ${user.email}` : "Neuen Benutzer erstellen"}
      primaryAction={{ content: isEdit ? "Speichern" : "Erstellen", onAction: handleSave, loading: saving }}
      secondaryActions={[{ content: "Abbrechen", onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!isEdit && (
              <TextField label="E-Mail *" type="email" value={form.email}
                onChange={(v) => set("email", v)} autoComplete="off" />
            )}
            <TextField label={isEdit ? "Neues Passwort (leer = nicht ändern)" : "Passwort *"}
              type="password" value={form.password}
              onChange={(v) => set("password", v)} autoComplete="new-password"
              helpText={isEdit ? "Leer lassen um nicht zu ändern" : "Mindestens 6 Zeichen"} />
          </div>
          <Checkbox
            label="Superuser (voller Zugriff, keine Beschränkungen)"
            checked={form.is_superuser}
            onChange={(v) => set("is_superuser", v)}
          />
          {!form.is_superuser && (
            <TextField label="Shop-/Store-Name" value={form.store_name}
              onChange={(v) => set("store_name", v)} autoComplete="off"
              helpText="Seller'ın mağaza adı (opsiyonel)" />
          )}
          {!form.is_superuser && (
            <div>
              <Text variant="headingSm" as="h3">Zugriffsrechte</Text>
              <Box paddingBlockStart="300">
                <PermissionsSelectorFull
                  value={form.permissions}
                  onChange={(v) => set("permissions", v)}
                  isSuperuserTarget={form.is_superuser}
                />
              </Box>
            </div>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPermissionsPage() {
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Seller sub-user state
  const [subusers, setSubusers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editSubuser, setEditSubuser] = useState(null);
  const [deletingSubuser, setDeletingSubuser] = useState(null);
  const [deletingInvite, setDeletingInvite] = useState(null);

  // Superuser state
  const [users, setUsers] = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Search / sort / filter state (superuser view)
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | "seller" | "superuser"
  const [sortBy, setSortBy] = useState("date_desc"); // "date_desc" | "date_asc" | "name_asc" | "name_desc" | "role"

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (su) fetchSuperuserData();
    else fetchSellerData();
  }, []);

  // ── Superuser data ──
  const fetchSuperuserData = async () => {
    setLoading(true); setError(null);
    try {
      const data = await getMedusaAdminClient().getSellerUsers();
      setUsers(data?.users || []);
    } catch (err) {
      setError(err?.message || "Failed to load users");
    } finally { setLoading(false); }
  };

  const handleDeleteUser = async (user) => {
    const myEmail = typeof window !== "undefined" ? localStorage.getItem("sellerEmail") : "";
    if (user.email === myEmail) { alert("Sie können Ihr eigenes Konto nicht löschen."); return; }
    if (!confirm(`Benutzer "${user.email}" wirklich löschen?`)) return;
    setDeleting(user.id);
    try {
      await getMedusaAdminClient().deleteSellerUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) { alert(e?.message || "Fehler beim Löschen"); }
    finally { setDeleting(null); }
  };

  // ── Seller sub-user data ──
  const fetchSellerData = async () => {
    setLoading(true); setError(null);
    try {
      const data = await getMedusaAdminClient().getSubusers();
      setSubusers(data?.subusers || []);
      setPendingInvites(data?.pending_invites || []);
    } catch (err) {
      setError(err?.message || "Fehler beim Laden");
    } finally { setLoading(false); }
  };

  const handleDeleteSubuser = async (user) => {
    if (!confirm(`Benutzer "${user.first_name} ${user.last_name}" (${user.email}) wirklich entfernen?`)) return;
    setDeletingSubuser(user.id);
    try {
      await getMedusaAdminClient().deleteSubuser(user.id);
      setSubusers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) { alert(e?.message || "Fehler beim Löschen"); }
    finally { setDeletingSubuser(null); }
  };

  const handleCancelInvite = async (invite) => {
    if (!confirm(`Einladung für "${invite.email}" wirklich stornieren?`)) return;
    setDeletingInvite(invite.id);
    try {
      await getMedusaAdminClient().deletePendingInvite(invite.id);
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (e) { alert(e?.message || "Fehler"); }
    finally { setDeletingInvite(null); }
  };

  // ── Superuser view ──
  if (isSuperuser) {
    // Apply search + role filter + sort
    const q = search.trim().toLowerCase();
    const filtered = users
      .filter((u) => {
        if (roleFilter === "seller" && u.is_superuser) return false;
        if (roleFilter === "superuser" && !u.is_superuser) return false;
        if (q) {
          const haystack = [u.email, u.store_name, u.first_name, u.last_name].filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_desc") return new Date(b.created_at) - new Date(a.created_at);
        if (sortBy === "date_asc") return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === "name_asc") return (a.store_name || a.email).localeCompare(b.store_name || b.email);
        if (sortBy === "name_desc") return (b.store_name || b.email).localeCompare(a.store_name || a.email);
        if (sortBy === "role") return (b.is_superuser ? 1 : 0) - (a.is_superuser ? 1 : 0);
        return 0;
      });

    const filterTabStyle = (val) => ({
      padding: "5px 14px",
      borderRadius: 20,
      fontSize: 13,
      fontWeight: roleFilter === val ? 700 : 400,
      background: roleFilter === val ? "#111827" : "#f3f4f6",
      color: roleFilter === val ? "#fff" : "#374151",
      border: "none",
      cursor: "pointer",
    });

    return (
      <Page
        title="Benutzer & Berechtigungen"
        primaryAction={{ content: "Neuer Benutzer", onAction: () => setEditUser({}) }}
      >
        <Layout>
          <Layout.Section>
            {error && <Banner tone="critical" onDismiss={() => setError(null)}><Text>{error}</Text></Banner>}
            <Card padding="0">
              {/* Search + Sort + Filter toolbar */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                {/* Search */}
                <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                  <TextField
                    placeholder="Suchen (E-Mail, Store-Name…)"
                    value={search}
                    onChange={setSearch}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setSearch("")}
                    size="slim"
                  />
                </div>
                {/* Role filter tabs */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={filterTabStyle("all")} onClick={() => setRoleFilter("all")}>Alle</button>
                  <button style={filterTabStyle("seller")} onClick={() => setRoleFilter("seller")}>Seller</button>
                  <button style={filterTabStyle("superuser")} onClick={() => setRoleFilter("superuser")}>Superuser</button>
                </div>
                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ padding: "6px 10px", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", cursor: "pointer" }}
                >
                  <option value="date_desc">Datum ↓ (neueste)</option>
                  <option value="date_asc">Datum ↑ (älteste)</option>
                  <option value="name_asc">Name A → Z</option>
                  <option value="name_desc">Name Z → A</option>
                  <option value="role">Rolle (Superuser zuerst)</option>
                </select>
                <Button onClick={fetchSuperuserData} loading={loading} size="slim">Aktualisieren</Button>
              </div>

              {/* Count line */}
              <div style={{ padding: "8px 20px", borderBottom: "1px solid #f9fafb", background: "#fafafa" }}>
                <Text variant="bodySm" tone="subdued">
                  {filtered.length} von {users.length} Benutzer{users.length !== 1 ? "n" : ""}
                </Text>
              </div>

              {loading ? (
                <Box padding="400"><Text tone="subdued">Laden…</Text></Box>
              ) : filtered.length === 0 ? (
                <Box padding="400">
                  <Text tone="subdued">
                    {users.length === 0 ? "Noch keine Benutzer registriert." : "Keine Benutzer gefunden."}
                  </Text>
                </Box>
              ) : (
                filtered.map((user, i) => (
                  <div
                    key={user.id}
                    style={{
                      padding: "14px 20px",
                      borderBottom: i < filtered.length - 1 ? "1px solid #f9fafb" : "none",
                      display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
                    }}
                  >
                    <div>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="semibold">
                          {user.is_superuser ? user.email : (user.store_name || user.email)}
                        </Text>
                        {user.is_superuser
                          ? <Badge tone="attention">Superuser</Badge>
                          : <Badge tone="info">Seller</Badge>
                        }
                      </InlineStack>
                      {!user.is_superuser && user.store_name && (
                        <Text variant="bodySm" tone="subdued">{user.email}</Text>
                      )}
                      {user.is_superuser && (
                        <Text variant="bodySm" tone="subdued">Voller Zugriff</Text>
                      )}
                      {!user.is_superuser && (
                        <Text variant="bodySm" tone="subdued">
                          {user.permissions ? `${user.permissions.length} Zugriffsrechte` : "Standard-Berechtigungen"}
                        </Text>
                      )}
                      <Text variant="bodySm" tone="subdued">
                        Erstellt: {new Date(user.created_at).toLocaleDateString("de-DE")}
                      </Text>
                    </div>
                    <InlineStack gap="200">
                      <Button size="slim" onClick={() => setEditUser(user)}>Bearbeiten</Button>
                      <Button size="slim" tone="critical" variant="secondary"
                        onClick={() => handleDeleteUser(user)} loading={deleting === user.id}>
                        Löschen
                      </Button>
                    </InlineStack>
                  </div>
                ))
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {editUser !== null && (
          <SuperUserModal
            user={editUser?.id ? editUser : null}
            onClose={() => setEditUser(null)}
            onSaved={() => { setEditUser(null); fetchSuperuserData(); }}
          />
        )}
      </Page>
    );
  }

  // ── Seller view ──
  return (
    <Page
      title="Benutzer & Rechte"
      primaryAction={{ content: "Benutzer einladen", onAction: () => setShowInviteModal(true) }}
    >
      <Layout>
        <Layout.Section>
          {error && <Banner tone="critical" onDismiss={() => setError(null)}><Text>{error}</Text></Banner>}

          {/* Active sub-users */}
          <Card padding="0">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="headingMd" as="h2">Aktive Benutzer ({subusers.length})</Text>
              <Button onClick={fetchSellerData} loading={loading} size="slim">Aktualisieren</Button>
            </div>
            {loading ? (
              <Box padding="400"><Text tone="subdued">Laden…</Text></Box>
            ) : subusers.length === 0 ? (
              <Box padding="400"><Text tone="subdued">Noch keine Benutzer hinzugefügt. Laden Sie einen Benutzer ein.</Text></Box>
            ) : (
              subusers.map((user, i) => (
                <div
                  key={user.id}
                  style={{
                    padding: "14px 20px",
                    borderBottom: i < subusers.length - 1 ? "1px solid #f9fafb" : "none",
                    display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
                  }}
                >
                  <div>
                    <Text variant="bodyMd" fontWeight="semibold">
                      {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
                    </Text>
                    <Text variant="bodySm" tone="subdued">{user.email}</Text>
                    <Text variant="bodySm" tone="subdued">
                      {user.permissions ? `${user.permissions.length} Zugriffsrechte` : "Standard-Berechtigungen"} · Hinzugefügt: {new Date(user.created_at).toLocaleDateString("de-DE")}
                    </Text>
                  </div>
                  <InlineStack gap="200">
                    <Button size="slim" onClick={() => setEditSubuser(user)}>Rechte</Button>
                    <Button size="slim" tone="critical" variant="secondary"
                      onClick={() => handleDeleteSubuser(user)} loading={deletingSubuser === user.id}>
                      Entfernen
                    </Button>
                  </InlineStack>
                </div>
              ))
            )}
          </Card>

          {/* Pending invitations */}
          {pendingInvites.length > 0 && (
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <Text variant="headingMd" as="h2">Ausstehende Einladungen ({pendingInvites.length})</Text>
              </div>
              {pendingInvites.map((invite, i) => (
                <div
                  key={invite.id}
                  style={{
                    padding: "14px 20px",
                    borderBottom: i < pendingInvites.length - 1 ? "1px solid #f9fafb" : "none",
                    display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
                  }}
                >
                  <div>
                    <InlineStack gap="200" blockAlign="center">
                      <Text variant="bodyMd" fontWeight="semibold">
                        {[invite.first_name, invite.last_name].filter(Boolean).join(" ") || invite.email}
                      </Text>
                      <Badge tone="warning">Ausstehend</Badge>
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued">
                      {invite.email} · Läuft ab: {new Date(invite.expires_at).toLocaleDateString("de-DE")}
                    </Text>
                  </div>
                  <Button size="slim" tone="critical" variant="secondary"
                    onClick={() => handleCancelInvite(invite)} loading={deletingInvite === invite.id}>
                    Stornieren
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </Layout.Section>
      </Layout>

      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onSaved={() => { setShowInviteModal(false); fetchSellerData(); }}
        />
      )}
      {editSubuser && (
        <EditPermissionsModal
          user={editSubuser}
          onClose={() => setEditSubuser(null)}
          onSaved={() => { setEditSubuser(null); fetchSellerData(); }}
        />
      )}
    </Page>
  );
}
