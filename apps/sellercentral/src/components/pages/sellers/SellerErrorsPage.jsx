"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Card, Text, BlockStack, InlineStack, Button, Box, TextField, Select, Spinner, Banner,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getSellerErrorsCopy } from "@/lib/marketing-i18n";

function getStatusOptions(locale) {
  return [
    { label: locale === "en" ? "All" : locale === "tr" ? "Tümü" : "Alle", value: "all" },
    { label: locale === "en" ? "Open" : locale === "tr" ? "Açık" : "Offen", value: "open" },
    { label: locale === "en" ? "Resolved" : locale === "tr" ? "Çözüldü" : "Gelöst", value: "resolved" },
    { label: locale === "en" ? "In progress" : locale === "tr" ? "İşlemde" : "In Bearbeitung", value: "in_progress" },
  ];
}

function getStatusStyle(locale) {
  return {
    open:        { bg: "#fef2f2", color: "#991b1b", label: locale === "en" ? "Open" : locale === "tr" ? "Açık" : "Offen" },
    in_progress: { bg: "#fffbeb", color: "#92400e", label: locale === "en" ? "In progress" : locale === "tr" ? "İşlemde" : "In Bearbeitung" },
    resolved:    { bg: "#f0fdf4", color: "#166534", label: locale === "en" ? "Resolved" : locale === "tr" ? "Çözüldü" : "Gelöst" },
  };
}

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
  return new Date(d).toLocaleString(loc, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status, locale = "de" }) {
  const styleMap = getStatusStyle(locale);
  const s = styleMap[status] || { bg: "#f3f4f6", color: "#374151", label: status };
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function ErrorDetailModal({ error, onClose, onUpdate, locale = "en" }) {
  const ui = getUI(locale);
  const sec = getSellerErrorsCopy(locale);
  const client = getMedusaAdminClient();
  const [resolution, setResolution] = useState(error.resolution || "");
  const [status, setStatus] = useState(error.status || "open");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await client.request(`/admin-hub/v1/seller-errors/${error.id}`, {
        method: "PATCH",
        body: JSON.stringify({ resolution, status, is_read: true }),
      });
      onUpdate();
      onClose();
    } catch (e) {
      alert(sec.errorPrefix + (e?.message || sec.unknown));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 950, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: "min(700px, 95vw)", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ padding: "16px 22px 12px", background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", borderRadius: "12px 12px 0 0" }}>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2" tone="text-inverse">{sec.issueDetail}</Text>
              <Text as="p" variant="bodySm" tone="text-inverse">
                {error.store_name || error.seller_email || error.seller_id || sec.unknownSeller} · {fmtDate(error.created_at, locale)}
              </Text>
            </BlockStack>
            <StatusBadge status={error.status} locale={locale} />
          </InlineStack>
        </div>

        <div style={{ padding: "20px 22px" }}>
          <BlockStack gap="400">
            {/* Error info */}
            {error.error_code && (
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="bold">Hata Kodu</Text>
                <code style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: 4, fontSize: 13, color: "#dc2626", fontFamily: "monospace" }}>
                  {error.error_code}
                </code>
              </BlockStack>
            )}
            {error.context && (
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="bold">Bağlam / Endpoint</Text>
                <code style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: 4, fontSize: 12, color: "#374151", fontFamily: "monospace" }}>
                  {error.context}
                </code>
              </BlockStack>
            )}
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="bold">Hata Mesajı</Text>
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#7f1d1d", wordBreak: "break-word" }}>
                {error.error_message}
              </div>
            </BlockStack>
            {error.terminal_output && (
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="bold">Terminal Çıktısı</Text>
                <pre style={{
                  background: "#111827", color: "#d1fae5", padding: "12px 14px",
                  borderRadius: 8, fontSize: 11, lineHeight: 1.6,
                  overflowX: "auto", maxHeight: 260, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                }}>
                  {error.terminal_output}
                </pre>
              </BlockStack>
            )}

            {/* Editable fields */}
            <Select
              label={locale === "en" ? "Status" : locale === "tr" ? "Durum" : "Status"}
              options={getStatusOptions(locale).filter(o => o.value !== "all")}
              value={status}
              onChange={setStatus}
            />
            <TextField
              label="Çözüm / Notlar"
              value={resolution}
              onChange={setResolution}
              multiline={4}
              placeholder={sec.resolutionPlaceholder}
              autoComplete="off"
            />
          </BlockStack>
        </div>

        <div style={{ padding: "14px 22px 18px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button onClick={onClose} disabled={saving}>{ui.close}</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>{ui.save}</Button>
        </div>
      </div>
    </div>
  );
}

export default function SellerErrorsPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const sec = useMemo(() => getSellerErrorsCopy(locale), [locale]);
  const client = getMedusaAdminClient();
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedError, setSelectedError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [unreadCount, setUnreadCount] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [newError, setNewError] = useState({ seller_id: "", error_code: "", error_message: "", terminal_output: "", context: "" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (sellerFilter.trim()) params.set("seller_id", sellerFilter.trim());
      const res = await client.request(`/admin-hub/v1/seller-errors?${params}`);
      setErrors(res?.errors || []);
      setUnreadCount(res?.unread_count || 0);
    } catch (e) {
      setError(e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : "Fehler"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sellerFilter]);

  useEffect(() => { load(); }, [load]);

  const handleMarkAllRead = async () => {
    for (const e of errors.filter(e => !e.is_read)) {
      await client.request(`/admin-hub/v1/seller-errors/${e.id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) }).catch(() => {});
    }
    load();
  };

  const handleDelete = async (err) => {
    const confirmMsg = locale === "en"
      ? `Delete this error: "${(err.error_message || "").slice(0, 60)}…"?`
      : locale === "tr"
      ? `Bu hatayı sil: "${(err.error_message || "").slice(0, 60)}…"?`
      : `Diesen Fehler löschen: "${(err.error_message || "").slice(0, 60)}…"?`;
    if (!await confirmDelete(confirmMsg)) return;
    await client.request(`/admin-hub/v1/seller-errors/${err.id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  const handleAdd = async () => {
    if (!newError.error_message.trim()) return;
    setAdding(true);
    try {
      await client.request("/admin-hub/v1/seller-errors", { method: "POST", body: JSON.stringify(newError) });
      setAddOpen(false);
      setNewError({ seller_id: "", error_code: "", error_message: "", terminal_output: "", context: "" });
      load();
    } catch (e) {
      alert(e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : "Fehler"));
    } finally {
      setAdding(false);
    }
  };

  const sorted = [...errors].sort((a, b) => {
    let va, vb;
    if (sortField === "created_at") { va = new Date(a.created_at).getTime(); vb = new Date(b.created_at).getTime(); }
    else if (sortField === "seller") { va = (a.store_name || a.seller_id || "").toLowerCase(); vb = (b.store_name || b.seller_id || "").toLowerCase(); }
    else { va = a[sortField] || ""; vb = b[sortField] || ""; }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const Th = ({ label, field }) => (
    <th onClick={() => toggleSort(field)} style={{
      padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6d7175",
      cursor: "pointer", userSelect: "none", background: "#f6f6f7",
      borderBottom: "1px solid #e1e3e5", fontSize: 12, whiteSpace: "nowrap",
    }}>
      {label} {sortField === field ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <Box padding="400">
      <BlockStack gap="400">
        {/* Header */}
        <Card padding="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text variant="headingMd" as="h1">{sec.issueLog}</Text>
                {unreadCount > 0 && (
                  <span style={{ background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                    {sec.unread(unreadCount)}
                  </span>
                )}
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodySm">{sec.issueLogSubtitle}</Text>
            </BlockStack>
            <InlineStack gap="200">
              {unreadCount > 0 && <Button size="slim" onClick={handleMarkAllRead}>{sec.markAllRead}</Button>}
              <Button size="slim" variant="primary" onClick={() => setAddOpen(true)}>{sec.addManual}</Button>
            </InlineStack>
          </InlineStack>
        </Card>

        {/* Filters */}
        <Card padding="300">
          <InlineStack gap="200" blockAlign="end" wrap>
            <Box minWidth="160px">
              <Select label={locale === "en" ? "Status" : locale === "tr" ? "Durum" : "Status"} options={getStatusOptions(locale)} value={statusFilter} onChange={setStatusFilter} />
            </Box>
            <Box minWidth="200px">
              <TextField
                label={sec.filterBySeller}
                value={sellerFilter}
                onChange={setSellerFilter}
                clearButton
                onClearButtonClick={() => setSellerFilter("")}
                placeholder="seller_id…"
                autoComplete="off"
              />
            </Box>
            <Text as="span" tone="subdued" variant="bodySm">{sec.records(sorted.length)}</Text>
          </InlineStack>
        </Card>

        {error && <Banner tone="critical" onDismiss={() => setError(null)}><p>{error}</p></Banner>}

        {/* Table */}
        <Card padding="0">
          {loading ? (
            <Box padding="400">
              <InlineStack gap="200" blockAlign="center"><Spinner size="small" /><Text as="p" tone="subdued">Yükleniyor…</Text></InlineStack>
            </Box>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px 12px", background: "#f6f6f7", borderBottom: "1px solid #e1e3e5", width: 8 }} />
                    <Th label="Tarih" field="created_at" />
                    <Th label="Satıcı" field="seller" />
                    <Th label="Hata Kodu" field="error_code" />
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6d7175", background: "#f6f6f7", borderBottom: "1px solid #e1e3e5", fontSize: 12 }}>Mesaj</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6d7175", background: "#f6f6f7", borderBottom: "1px solid #e1e3e5", fontSize: 12 }}>Durum</th>
                    <th style={{ padding: "10px 12px", background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af" }}>Kayıt bulunamadı.</td></tr>
                  ) : sorted.map((e) => (
                    <tr
                      key={e.id}
                      style={{ borderBottom: "1px solid #f1f1f1", background: e.is_read ? "#fff" : "#fffbeb", cursor: "pointer" }}
                      onClick={() => { setSelectedError(e); if (!e.is_read) client.request(`/admin-hub/v1/seller-errors/${e.id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) }).then(load).catch(() => {}); }}
                    >
                      <td style={{ padding: "8px 4px 8px 12px", width: 8 }}>
                        {!e.is_read && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>{fmtDate(e.created_at, locale)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#374151" }}>
                        {e.store_name || e.company_name || <span style={{ color: "#9ca3af" }}>{e.seller_id || "—"}</span>}
                        {e.seller_email && <div style={{ fontSize: 11, color: "#9ca3af" }}>{e.seller_email}</div>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {e.error_code
                          ? <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 11, color: "#dc2626" }}>{e.error_code}</code>
                          : <span style={{ color: "#d1d5db" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#374151", maxWidth: 300 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.error_message}</div>
                        {e.context && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{e.context}</div>}
                      </td>
                      <td style={{ padding: "10px 12px" }}><StatusBadge status={e.status} locale={locale} /></td>
                      <td style={{ padding: "10px 12px" }} onClick={(ev) => ev.stopPropagation()}>
                        <Button size="slim" tone="critical" onClick={() => handleDelete(e)}>{ui.delete}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </BlockStack>

      {/* Detail modal */}
      {selectedError && (
        <ErrorDetailModal
          error={selectedError}
          onClose={() => setSelectedError(null)}
          onUpdate={load}
          locale={locale}
        />
      )}

      {/* Manual add modal */}
      {addOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 960, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", width: "min(540px, 95vw)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", borderRadius: "12px 12px 0 0" }}>
              <Text variant="headingMd" as="h2" tone="text-inverse">Manuel Hata Ekle</Text>
            </div>
            <div style={{ padding: "20px 22px" }}>
              <BlockStack gap="300">
                <TextField label="Satıcı ID" value={newError.seller_id} onChange={v => setNewError(f => ({...f, seller_id: v}))} autoComplete="off" placeholder="seller_xxx" />
                <TextField label="Hata Kodu" value={newError.error_code} onChange={v => setNewError(f => ({...f, error_code: v}))} autoComplete="off" placeholder="E001" />
                <TextField label="Bağlam / Endpoint" value={newError.context} onChange={v => setNewError(f => ({...f, context: v}))} autoComplete="off" placeholder="/admin-hub/v1/..." />
                <TextField label="Hata Mesajı *" value={newError.error_message} onChange={v => setNewError(f => ({...f, error_message: v}))} multiline={3} autoComplete="off" />
                <TextField label="Terminal Çıktısı" value={newError.terminal_output} onChange={v => setNewError(f => ({...f, terminal_output: v}))} multiline={5} autoComplete="off" placeholder="Stack trace veya konsol çıktısı…" />
              </BlockStack>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button onClick={() => setAddOpen(false)} disabled={adding}>{ui.cancel}</Button>
              <Button variant="primary" onClick={handleAdd} loading={adding}>{ui.add}</Button>
            </div>
          </div>
        </div>
      )}
    </Box>
  );
}
