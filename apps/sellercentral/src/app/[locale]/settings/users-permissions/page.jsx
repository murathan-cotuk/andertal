"use client";

import React, { useState, useEffect } from "react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Badge, Banner, Box, TextField, Modal, Checkbox,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";
import { useUI } from "@/lib/ui-strings";
import { dateLocaleFor } from "@/lib/locale-text";
import {
  approvalStatusLabel,
  getPermissionsList,
  getUsersCopy,
  DEFAULT_SELLER_PERMS,
} from "@/lib/users-i18n";

const approvalStatusTone = (s) => {
  const v = String(s || "registered").toLowerCase();
  if (v === "approved" || v === "active") return "success";
  if (v === "rejected" || v === "suspended") return "critical";
  if (v === "documents_submitted" || v === "pending_approval" || v === "pending") return "warning";
  return "info";
};

const DEFAULT_PERMS = DEFAULT_SELLER_PERMS;

function PermissionsSelector({ value, onChange, permissionsList }) {
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
      {permissionsList.map((group) => {
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
function InviteModal({ onClose, onSaved, copy, ui, permissionsList }) {
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
    if (!form.email.trim()) { setErr(copy.emailRequired); return; }
    if (!form.first_name.trim() || !form.last_name.trim()) { setErr(copy.namesRequired); return; }
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
      setErr(e?.message || copy.inviteError);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.inviteModalTitle}
      primaryAction={{ content: copy.sendInvite, onAction: handleSend, loading: saving }}
      secondaryActions={[{ content: ui.cancel, onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <TextField label={copy.firstName} value={form.first_name}
              onChange={(v) => set("first_name", v)} autoComplete="off" />
            <TextField label={copy.lastName} value={form.last_name}
              onChange={(v) => set("last_name", v)} autoComplete="off" />
          </div>
          <TextField label={`${ui.colEmail} *`} type="email" value={form.email}
            onChange={(v) => set("email", v)} autoComplete="off" />
          <div>
            <Text variant="headingSm" as="h3">{copy.accessRights}</Text>
            <Box paddingBlockStart="300">
              <PermissionsSelector
                value={form.permissions}
                onChange={(v) => set("permissions", v)}
                permissionsList={permissionsList}
              />
            </Box>
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Edit Permissions Modal (for sellers, editing existing sub-user) ────────────
function EditPermissionsModal({ user, onClose, onSaved, copy, ui, permissionsList }) {
  const [permissions, setPermissions] = useState(user.permissions || DEFAULT_PERMS);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await getMedusaAdminClient().updateSubuser(user.id, { permissions });
      onSaved();
    } catch (e) {
      setErr(e?.message || copy.genericError);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.editPermissionsTitle(`${user.first_name || ""} ${user.last_name || ""}`.trim(), user.email)}
      primaryAction={{ content: ui.save, onAction: handleSave, loading: saving }}
      secondaryActions={[{ content: ui.cancel, onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}
          <PermissionsSelector value={permissions} onChange={setPermissions} permissionsList={permissionsList} />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function PermissionsSelectorFull({ value, onChange, permissionsList }) {
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
      {permissionsList.map((group) => {
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

function SuperUserModal({ user, onClose, onSaved, copy, ui, permissionsList }) {
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
      setErr(copy.emailPasswordRequired); return;
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
      setErr(e?.message || copy.genericError);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? copy.editUserTitle(user.email) : copy.createUserTitle}
      primaryAction={{ content: isEdit ? ui.save : ui.create, onAction: handleSave, loading: saving }}
      secondaryActions={[{ content: ui.cancel, onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!isEdit && (
              <TextField label={`${ui.colEmail} *`} type="email" value={form.email}
                onChange={(v) => set("email", v)} autoComplete="off" />
            )}
            <TextField label={isEdit ? copy.newPassword : copy.password}
              type="password" value={form.password}
              onChange={(v) => set("password", v)} autoComplete="new-password"
              helpText={isEdit ? copy.passwordHelpEdit : copy.passwordHelpNew} />
          </div>
          <Checkbox
            label={copy.superuserLabel}
            checked={form.is_superuser}
            onChange={(v) => set("is_superuser", v)}
          />
          {!form.is_superuser && (
            <TextField label={copy.storeName} value={form.store_name}
              onChange={(v) => set("store_name", v)} autoComplete="off"
              helpText={copy.storeNameHelp} />
          )}
          {!form.is_superuser && (
            <div>
              <Text variant="headingSm" as="h3">{copy.accessRights}</Text>
              <Box paddingBlockStart="300">
                <PermissionsSelectorFull
                  value={form.permissions}
                  onChange={(v) => set("permissions", v)}
                  permissionsList={permissionsList}
                />
              </Box>
            </div>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── KYB Review Modal ──────────────────────────────────────────────────────────
function KybReviewModal({ user, onClose, onApproved, copy, ui, locale }) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleAction = async (status) => {
    if (status === "rejected" && !rejectionReason.trim()) {
      setErr(copy.rejectionReasonRequired); return;
    }
    setSaving(true); setErr("");
    try {
      await getMedusaAdminClient().approveSellerById(user.id, status, status === "rejected" ? rejectionReason.trim() : null);
      onApproved(user.id, status);
      onClose();
    } catch (e) {
      setErr(e?.message || copy.genericError);
      setSaving(false);
    }
  };

  const addr = user.business_address || {};
  const docs = Array.isArray(user.documents) ? user.documents : [];

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.kybTitle(user.store_name || user.email)}
      secondaryActions={[{ content: ui.close, onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

          {/* Status */}
          <InlineStack gap="200" blockAlign="center">
            <Text variant="bodyMd" fontWeight="semibold">{ui.status}:</Text>
            <Badge tone={approvalStatusTone(user.approval_status)}>{approvalStatusLabel(locale, user.approval_status)}</Badge>
          </InlineStack>

          {/* Company info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
            {[
              [copy.companyName, user.company_name],
              [copy.authorizedPerson, user.authorized_person_name],
              [ui.colEmail, user.email],
              [ui.phone, user.phone],
              [copy.taxId, user.tax_id],
              [copy.vatId, user.vat_id],
              ["IBAN", user.iban],
              [copy.street, addr.street],
              [ui.city, addr.city],
              [ui.postalCode, addr.postal_code],
              [ui.country, addr.country],
            ].map(([label, val]) => val ? (
              <div key={label}>
                <Text variant="bodySm" tone="subdued">{label}</Text>
                <Text variant="bodyMd">{val}</Text>
              </div>
            ) : null)}
          </div>

          {/* Documents */}
          {docs.length > 0 && (
            <div>
              <Text variant="headingSm" as="h3">{copy.documents(docs.length)}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {docs.map((doc, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <div style={{ flex: 1 }}>
                      <Text variant="bodySm" fontWeight="semibold">{doc.doc_type ? { trade_register: copy.docTradeRegister, id_passport: copy.docIdPassport, tax_document: copy.docTax }[doc.doc_type] || doc.doc_type : doc.name}</Text>
                      {doc.name && <Text variant="bodySm" tone="subdued">{doc.name}</Text>}
                    </div>
                    {doc.url && (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0070f3", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                        {copy.open}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejection reason input */}
          {showRejectInput && (
            <TextField
              label={copy.rejectionReason}
              value={rejectionReason}
              onChange={setRejectionReason}
              multiline={3}
              autoComplete="off"
            />
          )}

          {/* Action buttons */}
          {(user.approval_status === "documents_submitted" || user.approval_status === "pending_approval" || user.approval_status === "pending") && (
            <InlineStack gap="200">
              <Button variant="primary" tone="success" onClick={() => handleAction("approved")} loading={saving && !showRejectInput}>
                {copy.approve}
              </Button>
              {!showRejectInput ? (
                <Button tone="critical" onClick={() => setShowRejectInput(true)}>{copy.reject}</Button>
              ) : (
                <Button tone="critical" onClick={() => handleAction("rejected")} loading={saving && showRejectInput}>
                  {copy.confirmReject}
                </Button>
              )}
            </InlineStack>
          )}
          {user.approval_status === "approved" && (
            <Button tone="critical" variant="secondary" onClick={() => handleAction("suspended")} loading={saving}>
              {copy.suspend}
            </Button>
          )}
          {(user.approval_status === "rejected" || user.approval_status === "suspended") && (
            <Button variant="primary" onClick={() => handleAction("approved")} loading={saving}>
              {copy.reapprove}
            </Button>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPermissionsPage() {
  const locale = useLocale();
  const ui = useUI();
  const copy = getUsersCopy(locale);
  const sellerPermissions = getPermissionsList(locale, false);
  const superPermissions = getPermissionsList(locale, true);
  const dateLoc = dateLocaleFor(locale);
  const fmtCreated = (d) => d ? new Date(d).toLocaleDateString(dateLoc, { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [myEmail, setMyEmail] = useState("");
  const [myStoreName, setMyStoreName] = useState("");
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
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | "seller" | "superuser" | "kyb_pending"
  const [sortBy, setSortBy] = useState("date_desc"); // "date_desc" | "date_asc" | "name_asc" | "name_desc" | "role"

  // KYB review
  const [kybUser, setKybUser] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const su = localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    setMyEmail(localStorage.getItem("sellerEmail") || "");
    setMyStoreName(localStorage.getItem("storeName") || "");
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

  const handleApprovalUpdate = (userId, newStatus) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, approval_status: newStatus } : u));
  };

  const handleDeleteUser = async (user) => {
    const myEmail = typeof window !== "undefined" ? localStorage.getItem("sellerEmail") : "";
    if (user.email === myEmail) { alert(copy.cannotDeleteSelf); return; }
    if (!(await confirmDelete(copy.deleteUserConfirm(user.email)))) return;
    setDeleting(user.id);
    try {
      await getMedusaAdminClient().deleteSellerUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) { alert(e?.message || copy.deleteError); }
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
      setError(err?.message || copy.loadError);
    } finally { setLoading(false); }
  };

  const handleDeleteSubuser = async (user) => {
    if (!(await confirmDelete(copy.deleteSubuserConfirm(`${user.first_name} ${user.last_name}`.trim(), user.email)))) return;
    setDeletingSubuser(user.id);
    try {
      await getMedusaAdminClient().deleteSubuser(user.id);
      setSubusers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) { alert(e?.message || copy.deleteError); }
    finally { setDeletingSubuser(null); }
  };

  const handleCancelInvite = async (invite) => {
    if (!(await confirmDelete(copy.cancelInviteConfirm(invite.email)))) return;
    setDeletingInvite(invite.id);
    try {
      await getMedusaAdminClient().deletePendingInvite(invite.id);
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (e) { alert(e?.message || copy.genericError); }
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
        if (roleFilter === "kyb_pending") {
          if (u.is_superuser) return false;
          const s = String(u.approval_status || "registered").toLowerCase();
          if (!["documents_submitted", "pending_approval", "pending"].includes(s)) return false;
        }
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
        title={copy.pageTitleSuper}
        primaryAction={{ content: copy.newUser, onAction: () => setEditUser({}) }}
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
                    placeholder={copy.searchPlaceholder}
                    value={search}
                    onChange={setSearch}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setSearch("")}
                    size="slim"
                  />
                </div>
                {/* Role filter tabs */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button style={filterTabStyle("all")} onClick={() => setRoleFilter("all")}>{copy.filterAll}</button>
                  <button style={filterTabStyle("seller")} onClick={() => setRoleFilter("seller")}>{copy.filterSeller}</button>
                  <button style={filterTabStyle("superuser")} onClick={() => setRoleFilter("superuser")}>{copy.filterSuperuser}</button>
                  <button style={filterTabStyle("kyb_pending")} onClick={() => setRoleFilter("kyb_pending")}>
                    {copy.filterKyb} {users.filter((u) => !u.is_superuser && ["documents_submitted","pending_approval","pending"].includes(String(u.approval_status||""))).length > 0 ? `(${users.filter((u) => !u.is_superuser && ["documents_submitted","pending_approval","pending"].includes(String(u.approval_status||""))).length})` : ""}
                  </button>
                </div>
                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ padding: "6px 10px", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", cursor: "pointer" }}
                >
                  <option value="date_desc">{copy.sortDateDesc}</option>
                  <option value="date_asc">{copy.sortDateAsc}</option>
                  <option value="name_asc">{copy.sortNameAsc}</option>
                  <option value="name_desc">{copy.sortNameDesc}</option>
                  <option value="role">{copy.sortRole}</option>
                </select>
                <Button onClick={fetchSuperuserData} loading={loading} size="slim">{ui.refresh}</Button>
              </div>

              {/* Count line */}
              <div style={{ padding: "8px 20px", borderBottom: "1px solid #f9fafb", background: "#fafafa" }}>
                <Text variant="bodySm" tone="subdued">
                  {copy.userCount(filtered.length, users.length)}
                </Text>
              </div>

              {loading ? (
                <Box padding="400"><Text tone="subdued">{ui.loading}</Text></Box>
              ) : filtered.length === 0 ? (
                <Box padding="400">
                  <Text tone="subdued">
                    {users.length === 0 ? copy.noUsers : copy.noUsersFound}
                  </Text>
                </Box>
              ) : (
                (() => {
                  const myUser = myEmail ? filtered.find((u) => u.email === myEmail) : null;
                  const otherUsers = myEmail ? filtered.filter((u) => u.email !== myEmail) : filtered;
                  const renderRow = (user, i, arr) => (
                    <div
                      key={user.id}
                      style={{
                        padding: "14px 20px",
                        borderBottom: i < arr.length - 1 ? "1px solid #f9fafb" : "none",
                        display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
                        background: user.email === myEmail ? "#f0fdf4" : undefined,
                      }}
                    >
                    <div>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="semibold">
                          {user.is_superuser ? user.email : (user.store_name || user.email)}
                        </Text>
                        {user.email === myEmail && <Badge tone="success">{copy.you}</Badge>}
                        {user.is_superuser
                          ? <Badge tone="attention">{copy.filterSuperuser}</Badge>
                          : <Badge tone="info">{copy.filterSeller}</Badge>
                        }
                        {!user.is_superuser && (
                          <Badge tone={approvalStatusTone(user.approval_status)}>
                            {approvalStatusLabel(locale, user.approval_status)}
                          </Badge>
                        )}
                      </InlineStack>
                      {!user.is_superuser && user.store_name && (
                        <Text variant="bodySm" tone="subdued">{user.email}</Text>
                      )}
                      {user.is_superuser && (
                        <Text variant="bodySm" tone="subdued">{copy.fullAccess}</Text>
                      )}
                      {!user.is_superuser && (
                        <Text variant="bodySm" tone="subdued">
                          {user.permissions ? copy.permissionsCount(user.permissions.length) : copy.defaultPermissions}
                        </Text>
                      )}
                      <Text variant="bodySm" tone="subdued">
                        {copy.created}: {fmtCreated(user.created_at)}
                      </Text>
                    </div>
                    <InlineStack gap="200">
                      {!user.is_superuser && (
                        <Button size="slim" variant="secondary" onClick={() => setKybUser(user)}>KYB</Button>
                      )}
                      <Button size="slim" onClick={() => setEditUser(user)}>{ui.edit}</Button>
                      <Button size="slim" tone="critical" variant="secondary"
                        onClick={() => handleDeleteUser(user)} loading={deleting === user.id}>
                        {ui.delete}
                      </Button>
                    </InlineStack>
                  </div>
                  );
                  return (
                    <>
                      {myUser && renderRow(myUser, 0, [myUser])}
                      {myUser && otherUsers.length > 0 && (
                        <div style={{ height: 1, background: "#d1fae5", margin: "0 20px" }} />
                      )}
                      {otherUsers.map((u, i) => renderRow(u, i, otherUsers))}
                    </>
                  );
                })()
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {editUser !== null && (
          <SuperUserModal
            user={editUser?.id ? editUser : null}
            onClose={() => setEditUser(null)}
            onSaved={() => { setEditUser(null); fetchSuperuserData(); }}
            copy={copy}
            ui={ui}
            permissionsList={superPermissions}
          />
        )}
        {kybUser && (
          <KybReviewModal
            user={kybUser}
            onClose={() => setKybUser(null)}
            onApproved={handleApprovalUpdate}
            copy={copy}
            ui={ui}
            locale={locale}
          />
        )}
      </Page>
    );
  }

  // ── Seller view ──
  return (
    <Page
      title={copy.pageTitleSeller}
      primaryAction={{ content: copy.inviteUser, onAction: () => setShowInviteModal(true) }}
    >
      <Layout>
        <Layout.Section>
          {error && <Banner tone="critical" onDismiss={() => setError(null)}><Text>{error}</Text></Banner>}

          {/* Active sub-users */}
          <Card padding="0">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="headingMd" as="h2">{copy.activeUsers(subusers.length + 1)}</Text>
              <Button onClick={fetchSellerData} loading={loading} size="slim">{ui.refresh}</Button>
            </div>

            {/* ── Current account row (always first) ── */}
            <div style={{
              padding: "14px 20px",
              borderBottom: "1px solid #f9fafb",
              display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
              background: "#f0fdf4",
            }}>
              <div>
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="bodyMd" fontWeight="semibold">
                    {myStoreName || myEmail}
                  </Text>
                  <Badge tone="success">{copy.you}</Badge>
                  <Badge tone="attention">{copy.owner}</Badge>
                </InlineStack>
                {myStoreName && <Text variant="bodySm" tone="subdued">{myEmail}</Text>}
                <Text variant="bodySm" tone="subdued">{copy.ownerSub}</Text>
              </div>
              <InlineStack gap="200">
                <Button size="slim" disabled>{copy.permissionsBtn}</Button>
              </InlineStack>
            </div>

            {loading ? (
              <Box padding="400"><Text tone="subdued">{ui.loading}</Text></Box>
            ) : subusers.length === 0 ? (
              <Box padding="400"><Text tone="subdued">{copy.noSubusers}</Text></Box>
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
                      {user.permissions ? copy.permissionsCount(user.permissions.length) : copy.defaultPermissions} · {copy.added}: {fmtCreated(user.created_at)}
                    </Text>
                  </div>
                  <InlineStack gap="200">
                    <Button size="slim" onClick={() => setEditSubuser(user)}>{copy.permissionsBtn}</Button>
                    <Button size="slim" tone="critical" variant="secondary"
                      onClick={() => handleDeleteSubuser(user)} loading={deletingSubuser === user.id}>
                      {copy.remove}
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
                <Text variant="headingMd" as="h2">{copy.pendingInvites(pendingInvites.length)}</Text>
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
                      <Badge tone="warning">{copy.pending}</Badge>
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued">
                      {invite.email} · {copy.expires}: {fmtCreated(invite.expires_at)}
                    </Text>
                  </div>
                  <Button size="slim" tone="critical" variant="secondary"
                    onClick={() => handleCancelInvite(invite)} loading={deletingInvite === invite.id}>
                    {copy.cancelInvite}
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
          copy={copy}
          ui={ui}
          permissionsList={sellerPermissions}
        />
      )}
      {editSubuser && (
        <EditPermissionsModal
          user={editSubuser}
          onClose={() => setEditSubuser(null)}
          onSaved={() => { setEditSubuser(null); fetchSellerData(); }}
          copy={copy}
          ui={ui}
          permissionsList={sellerPermissions}
        />
      )}
    </Page>
  );
}
