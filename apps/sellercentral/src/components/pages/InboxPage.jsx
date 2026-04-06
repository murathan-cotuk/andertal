"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Page, Text, Button, Badge, BlockStack, InlineStack,
  Box, Divider, Spinner, TextField, Tabs,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtCents(c) {
  if (c == null) return "—";
  return (Number(c) / 100).toFixed(2).replace(".", ",") + " €";
}

const STATUS_TONE = {
  pending: "warning", processing: "info", shipped: "info",
  delivered: "success", cancelled: "critical", refunded: "critical", completed: "success",
};
const STATUS_LABEL = {
  pending: "Ausstehend", processing: "In Bearbeitung", shipped: "Versendet",
  delivered: "Geliefert", cancelled: "Storniert", refunded: "Erstattet", completed: "Abgeschlossen",
};

function groupByOrder(messages) {
  const map = {};
  for (const m of messages) {
    const key = m.order_id || "__no_order__";
    if (!map[key]) {
      map[key] = {
        order_id: m.order_id,
        order_number: m.order_number,
        order_status: m.order_status || m.order_order_status,
        order_total_cents: m.order_total_cents,
        order_first_name: m.order_first_name,
        order_last_name: m.order_last_name,
        order_email: m.order_email,
        messages: [],
      };
    }
    map[key].messages.push(m);
  }
  return Object.values(map)
    .map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")) }))
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.created_at || "";
      const bLast = b.messages[b.messages.length - 1]?.created_at || "";
      return bLast.localeCompare(aLast);
    });
}

function groupBySeller(messages) {
  const map = {};
  for (const m of messages) {
    const key = m.seller_id || "__unknown__";
    if (!map[key]) {
      map[key] = { seller_id: m.seller_id, messages: [] };
    }
    map[key].messages.push(m);
  }
  return Object.values(map)
    .map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")) }))
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.created_at || "";
      const bLast = b.messages[b.messages.length - 1]?.created_at || "";
      return bLast.localeCompare(aLast);
    });
}

/** Normalized subject key for grouping (empty string = no subject / legacy). */
function normalizeSupportSubjectKey(subject) {
  if (subject == null) return "";
  return String(subject).trim();
}

function supportSubjectTitle(subjectKey) {
  return subjectKey ? subjectKey : "Allgemein";
}

function replySubjectForSupportThread(messages) {
  const sorted = [...messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  for (const m of sorted) {
    const t = m.subject != null && String(m.subject).trim();
    if (t) return String(m.subject).trim();
  }
  return null;
}

function groupBySupportSubject(messages) {
  const map = {};
  for (const m of messages) {
    const key = normalizeSupportSubjectKey(m.subject);
    if (!map[key]) map[key] = { subject_key: key, messages: [] };
    map[key].messages.push(m);
  }
  return Object.values(map)
    .map((t) => ({
      ...t,
      messages: [...t.messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")),
      reply_subject: replySubjectForSupportThread(t.messages),
    }))
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.created_at || "";
      const bLast = b.messages[b.messages.length - 1]?.created_at || "";
      return bLast.localeCompare(aLast);
    });
}

// ── Customer tab (original inbox) ──────────────────────────────────────────

function CustomerInbox({ client }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getMessages();
      if (!data?.__error) setThreads(groupByOrder(data?.messages || []));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [selected?.messages?.length]);

  const handleSelectThread = async (thread) => {
    setSelected(thread);
    setReply("");
    setErr("");
    setOrderItems([]);
    if (thread.order_id) {
      try {
        const data = await client.request(`/admin-hub/orders/${thread.order_id}`);
        if (data?.order?.items) setOrderItems(data.order.items);
      } catch (_) {}
    }
    for (const m of thread.messages) {
      if (m.sender_type === "customer" && !m.is_read_by_seller) {
        client.markMessageRead(m.id).catch(() => {});
      }
    }
  };

  const handleSend = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    setErr("");
    try {
      await client.sendMessage({
        order_id: selected.order_id || undefined,
        body: reply.trim(),
        subject: selected.order_number ? `Re: Bestellung #${selected.order_number}` : "Nachricht",
      });
      setReply("");
      const data = await client.getMessages();
      if (!data?.__error) {
        const updated = groupByOrder(data?.messages || []);
        setThreads(updated);
        const key = selected.order_id || "__no_order__";
        const updatedThread = updated.find((t) => (t.order_id || "__no_order__") === key);
        if (updatedThread) setSelected(updatedThread);
      }
    } catch (e) {
      setErr(e?.message || "Fehler beim Senden");
    }
    setSending(false);
  };

  const unreadCount = (thread) =>
    thread.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_seller).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 260px", gap: 12, height: "calc(100vh - 220px)", minHeight: 500 }}>
      {/* Thread list */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        <Box padding="300" borderBlockEndWidth="025" borderColor="border">
          <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Konversationen</Text>
        </Box>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <Box padding="400"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>}
          {!loading && threads.length === 0 && (
            <Box padding="400"><Text as="p" variant="bodySm" tone="subdued" alignment="center">Keine Nachrichten</Text></Box>
          )}
          {threads.map((thread) => {
            const last = thread.messages[thread.messages.length - 1];
            const unread = unreadCount(thread);
            const isActive = selected && (selected.order_id || "__no_order__") === (thread.order_id || "__no_order__");
            const customerName = [thread.order_first_name, thread.order_last_name].filter(Boolean).join(" ") || thread.order_email || "Kunde";
            return (
              <div key={thread.order_id || "__no_order__"} style={{ borderBottom: "1px solid #e1e3e5" }}>
                <button
                  onClick={() => handleSelectThread(thread)}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 14px",
                    background: isActive ? "var(--p-color-bg-surface-selected, #fff7ed)" : "transparent",
                    borderLeft: isActive ? "3px solid var(--p-color-bg-fill-brand, #ff971c)" : "3px solid transparent",
                    borderTop: "none", borderRight: "none", borderBottom: "none",
                    cursor: "pointer", display: "block",
                  }}
                >
                  <InlineStack align="space-between" blockAlign="start" gap="100">
                    <Text as="span" variant="bodySm" fontWeight="bold">{customerName}</Text>
                    <InlineStack gap="100" blockAlign="center">
                      {unread > 0 && (
                        <span style={{ background: "var(--p-color-bg-fill-critical)", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {unread}
                        </span>
                      )}
                      <Text as="span" variant="bodySm" tone="subdued">{fmtDate(last?.created_at)}</Text>
                    </InlineStack>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {thread.order_number ? `#${thread.order_number}` : "Allgemein"}
                  </Text>
                  <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {last?.body?.slice(0, 55) || "—"}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Message thread */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text as="p" variant="bodySm" tone="subdued">Konversation auswählen</Text>
          </div>
        ) : (
          <>
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {selected.order_number ? `Bestellung #${selected.order_number}` : "Allgemein"}
                </Text>
                {selected.order_status && (
                  <Badge tone={STATUS_TONE[selected.order_status] || "new"}>
                    {STATUS_LABEL[selected.order_status] || selected.order_status}
                  </Badge>
                )}
                {selected.order_id && (
                  <Button variant="plain" size="slim" url={`/orders/${selected.order_id}`}>Öffnen →</Button>
                )}
              </InlineStack>
            </Box>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {selected.messages.map((m) => {
                const isSeller = m.sender_type === "seller";
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: isSeller ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "72%",
                      background: isSeller ? "var(--p-color-bg-fill-brand, #ff971c)" : "var(--p-color-bg-surface-secondary)",
                      color: isSeller ? "#fff" : "var(--p-color-text)",
                      borderRadius: isSeller ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      padding: "9px 13px",
                      border: isSeller ? "none" : "1px solid var(--p-color-border-subdued)",
                    }}>
                      {!isSeller && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--p-color-text-subdued)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".04em" }}>
                          Kunde
                        </div>
                      )}
                      <Text as="p" variant="bodySm">{m.body}</Text>
                      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65 }}>{fmtDate(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <Box padding="300" borderBlockStartWidth="025" borderColor="border">
              <BlockStack gap="200">
                {err && <Text as="p" variant="bodySm" tone="critical">{err}</Text>}
                <InlineStack gap="200" blockAlign="end">
                  <div style={{ flex: 1 }}>
                    <TextField
                      value={reply}
                      onChange={setReply}
                      placeholder="Antwort schreiben… (Enter zum Senden)"
                      multiline={2}
                      autoComplete="off"
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                  </div>
                  <Button variant="primary" onClick={handleSend} disabled={sending || !reply.trim()} loading={sending}>
                    Senden
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>
          </>
        )}
      </div>

      {/* Order detail sidebar */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        <Box padding="300" borderBlockEndWidth="025" borderColor="border">
          <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Bestelldetails</Text>
        </Box>
        {!selected || !selected.order_id ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center" }}>
            <Text as="p" variant="bodySm" tone="subdued">Bestellung auswählen</Text>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <Box padding="300">
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Kunde</Text>
                  <Text as="p" variant="bodySm">
                    {[selected.order_first_name, selected.order_last_name].filter(Boolean).join(" ") || "—"}
                  </Text>
                  {selected.order_email && (
                    <Text as="p" variant="bodySm" tone="subdued">{selected.order_email}</Text>
                  )}
                </BlockStack>
                <Divider />
                <InlineStack gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">Status</Text>
                    <Badge tone={STATUS_TONE[selected.order_status] || "new"}>
                      {STATUS_LABEL[selected.order_status] || selected.order_status || "—"}
                    </Badge>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">Gesamt</Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">{fmtCents(selected.order_total_cents)}</Text>
                  </BlockStack>
                </InlineStack>
                {orderItems.length > 0 && (
                  <>
                    <Divider />
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" fontWeight="semibold">Artikel</Text>
                      {orderItems.map((item, i) => (
                        <InlineStack key={item.id || i} gap="200" blockAlign="center" wrap={false}>
                          <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid var(--p-color-border)", overflow: "hidden", flexShrink: 0, background: "var(--p-color-bg-surface-secondary)" }}>
                            {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                          </div>
                          <BlockStack gap="0">
                            <Text as="p" variant="bodySm" fontWeight="medium" truncate>{item.title || "—"}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{item.quantity}× {fmtCents(item.unit_price_cents)}</Text>
                          </BlockStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </>
                )}
                <Button variant="primary" url={`/orders/${selected.order_id}`} fullWidth>
                  Bestellung öffnen →
                </Button>
              </BlockStack>
            </Box>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Support / Sellers tab ───────────────────────────────────────────────────
// Superusers: sellers (left) → subjects per seller (middle) → messages (right)
// Regular sellers: subjects (left, by Betreff) → messages (right), like Kunden/orders

function SupportInbox({ client, isSuperuser, mySellerID, sellerNames, sellerUserIds }) {
  const [rawMessages, setRawMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSellerId, setSelectedSellerId] = useState(null);
  /** `null` = none; `""` = legacy / no subject */
  const [selectedSubjectKey, setSelectedSubjectKey] = useState(null);
  const [isNewSubject, setIsNewSubject] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef(null);

  const sellerThreads = isSuperuser ? groupBySeller(rawMessages) : [];
  const selectedSellerThread = selectedSellerId
    ? sellerThreads.find((t) => t.seller_id === selectedSellerId) || null
    : null;

  const subjectThreadsForSeller = selectedSellerThread
    ? groupBySupportSubject(selectedSellerThread.messages)
    : [];

  const subjectThreadsRegular = !isSuperuser ? groupBySupportSubject(rawMessages) : [];

  const subjectList = isSuperuser ? subjectThreadsForSeller : subjectThreadsRegular;
  const selectedSubjectThread =
    selectedSubjectKey !== null
      ? subjectList.find((t) => t.subject_key === selectedSubjectKey) || null
      : null;

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getSupportMessages();
      if (!data?.__error) setRawMessages(data?.messages || []);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [selectedSubjectThread?.messages?.length, isNewSubject, reply]);

  const unreadForSubjectThread = (subThread) => {
    if (isSuperuser) {
      return subThread.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_support).length;
    }
    return subThread.messages.filter((m) => m.sender_type === "seller" && !m.is_read_by_seller).length;
  };

  const unreadForSellerThread = (sellerThread) => {
    return groupBySupportSubject(sellerThread.messages).reduce((n, st) => n + unreadForSubjectThread(st), 0);
  };

  const getSellerLabel = (seller_id) => {
    if (!seller_id) return "Unbekannt";
    const key = String(seller_id);
    const fallback = key.length > 18 ? `${key.slice(0, 18)}…` : key;
    return sellerNames[key] || sellerNames[seller_id] || fallback;
  };

  const getSellerProfileHref = (seller_id) => {
    if (!seller_id) return null;
    const key = String(seller_id);
    const userId = sellerUserIds[key] || sellerUserIds[seller_id];
    return userId ? `/sellers/${userId}` : null;
  };

  const handleSelectSeller = (thread) => {
    setSelectedSellerId(thread.seller_id);
    setSelectedSubjectKey(null);
    setIsNewSubject(false);
    setNewSubject("");
    setReply("");
    setErr("");
  };

  const handleSelectSubject = (subThread) => {
    setSelectedSubjectKey(subThread.subject_key);
    setIsNewSubject(false);
    setNewSubject("");
    setReply("");
    setErr("");
    const threadIds = new Set(subThread.messages.map((m) => m.id));
    if (isSuperuser && selectedSellerId) {
      client.markSupportMessagesRead(selectedSellerId, "support", subThread.subject_key).catch(() => {});
      setRawMessages((prev) => prev.map((m) => {
        if (!threadIds.has(m.id)) return m;
        if (m.sender_type === "customer") return { ...m, is_read_by_support: true };
        return m;
      }));
    } else if (!isSuperuser) {
      for (const m of subThread.messages) {
        if (m.sender_type === "seller" && !m.is_read_by_seller) {
          client.markMessageRead(m.id).catch(() => {});
        }
      }
      setRawMessages((prev) => prev.map((m) => {
        if (!threadIds.has(m.id)) return m;
        if (m.sender_type === "seller") return { ...m, is_read_by_seller: true };
        return m;
      }));
    }
  };

  const startNewSubject = () => {
    setSelectedSubjectKey(null);
    setIsNewSubject(true);
    setNewSubject("");
    setReply("");
    setErr("");
  };

  const headerTitle = () => {
    if (isSuperuser) {
      if (!selectedSellerThread) return "Support";
      if (isNewSubject) return `Neues Thema · ${getSellerLabel(selectedSellerThread.seller_id)}`;
      if (selectedSubjectThread) {
        return `${supportSubjectTitle(selectedSubjectThread.subject_key)} · ${getSellerLabel(selectedSellerThread.seller_id)}`;
      }
      return getSellerLabel(selectedSellerThread.seller_id);
    }
    if (isNewSubject) return "Neues Thema";
    if (selectedSubjectThread) return supportSubjectTitle(selectedSubjectThread.subject_key);
    return "Support Team";
  };

  const canSend = () => {
    if (!reply.trim()) return false;
    if (isSuperuser && !selectedSellerThread) return false;
    if (isNewSubject) return !!newSubject.trim();
    if (!selectedSubjectThread) return false;
    return true;
  };

  const handleSend = async () => {
    if (!canSend()) return;
    setSending(true);
    setErr("");
    try {
      const subjectForApi = isNewSubject
        ? newSubject.trim()
        : (() => {
          const t = selectedSubjectThread;
          if (!t) return null;
          if (t.reply_subject) return t.reply_subject;
          return t.subject_key !== "" ? t.subject_key : null;
        })();

      if (isSuperuser) {
        await client.sendSupportMessage({
          body: reply.trim(),
          target_seller_id: selectedSellerThread.seller_id,
          sender_seller_id: null,
          subject: subjectForApi || undefined,
        });
      } else {
        await client.sendSupportMessage({
          body: reply.trim(),
          sender_seller_id: mySellerID,
          subject: subjectForApi || undefined,
        });
      }
      setReply("");
      if (isNewSubject) {
        setNewSubject("");
        setIsNewSubject(false);
      }
      const data = await client.getSupportMessages();
      if (!data?.__error) {
        const msgs = data?.messages || [];
        setRawMessages(msgs);
        const sk = normalizeSupportSubjectKey(subjectForApi);
        setSelectedSubjectKey(sk);
      }
    } catch (e) {
      setErr(e?.message || "Fehler beim Senden");
    }
    setSending(false);
  };

  const activeMessages = selectedSubjectThread?.messages || [];
  const showComposer =
    isSuperuser
      ? !!selectedSellerThread && (isNewSubject || !!selectedSubjectThread)
      : isNewSubject || !!selectedSubjectThread;

  const gridCols = isSuperuser ? "280px 260px 1fr" : "280px 1fr";

  return (
    <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 12, height: "calc(100vh - 220px)", minHeight: 500 }}>

      {isSuperuser && (
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
          <Box padding="300" borderBlockEndWidth="025" borderColor="border">
            <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Verkäufer</Text>
          </Box>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <Box padding="400"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>}
            {!loading && sellerThreads.length === 0 && (
              <Box padding="400"><Text as="p" variant="bodySm" tone="subdued" alignment="center">Keine Nachrichten</Text></Box>
            )}
            {sellerThreads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              const unread = unreadForSellerThread(thread);
              const isActive = selectedSellerThread?.seller_id === thread.seller_id;
              return (
                <div key={thread.seller_id || "__unknown__"} style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <button
                    type="button"
                    onClick={() => handleSelectSeller(thread)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 14px",
                      background: isActive ? "var(--p-color-bg-surface-selected, #fff7ed)" : "transparent",
                      borderLeft: isActive ? "3px solid var(--p-color-bg-fill-brand, #ff971c)" : "3px solid transparent",
                      borderTop: "none", borderRight: "none", borderBottom: "none",
                      cursor: "pointer", display: "block",
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="start" gap="100">
                      <Text as="span" variant="bodySm" fontWeight="bold">{getSellerLabel(thread.seller_id)}</Text>
                      <InlineStack gap="100" blockAlign="center">
                        {unread > 0 && (
                          <span style={{ background: "var(--p-color-bg-fill-critical)", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: "0 4px" }}>
                            {unread}
                          </span>
                        )}
                        <Text as="span" variant="bodySm" tone="subdued">{fmtDate(last?.created_at)}</Text>
                      </InlineStack>
                    </InlineStack>
                    <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {last?.body?.slice(0, 55) || "—"}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subject column: superuser (per seller) or regular seller */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        <Box padding="300" borderBlockEndWidth="025" borderColor="border">
          <InlineStack align="space-between" blockAlign="center" gap="200">
            <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Themen</Text>
            {(!isSuperuser || selectedSellerThread) && (
              <Button variant="plain" size="slim" onClick={startNewSubject} disabled={isSuperuser && !selectedSellerThread}>
                + Neu
              </Button>
            )}
          </InlineStack>
        </Box>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isSuperuser && !selectedSellerThread && (
            <Box padding="400"><Text as="p" variant="bodySm" tone="subdued" alignment="center">Verkäufer wählen</Text></Box>
          )}
          {(isSuperuser ? !!selectedSellerThread : true) && loading && (
            <Box padding="400"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>
          )}
          {((isSuperuser && selectedSellerThread) || !isSuperuser) && !loading && subjectList.length === 0 && !isNewSubject && (
            <Box padding="400">
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">Noch keine Konversationen</Text>
            </Box>
          )}
          {subjectList.map((thread) => {
            const last = thread.messages[thread.messages.length - 1];
            const unread = unreadForSubjectThread(thread);
            const isActive = !isNewSubject && selectedSubjectKey !== null && selectedSubjectKey === thread.subject_key;
            return (
              <div key={`${isSuperuser ? selectedSellerThread?.seller_id : "me"}-${thread.subject_key || "__"}`} style={{ borderBottom: "1px solid #e1e3e5" }}>
                <button
                  type="button"
                  onClick={() => handleSelectSubject(thread)}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 14px",
                    background: isActive ? "var(--p-color-bg-surface-selected, #fff7ed)" : "transparent",
                    borderLeft: isActive ? "3px solid var(--p-color-bg-fill-brand, #ff971c)" : "3px solid transparent",
                    borderTop: "none", borderRight: "none", borderBottom: "none",
                    cursor: "pointer", display: "block",
                  }}
                >
                  <InlineStack align="space-between" blockAlign="start" gap="100">
                    <Text as="span" variant="bodySm" fontWeight="bold">{supportSubjectTitle(thread.subject_key)}</Text>
                    <InlineStack gap="100" blockAlign="center">
                      {unread > 0 && (
                        <span style={{ background: "var(--p-color-bg-fill-critical)", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: "0 4px" }}>
                          {unread}
                        </span>
                      )}
                      <Text as="span" variant="bodySm" tone="subdued">{fmtDate(last?.created_at)}</Text>
                    </InlineStack>
                  </InlineStack>
                  <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {last?.body?.slice(0, 48) || "—"}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        {!showComposer ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text as="p" variant="bodySm" tone="subdued">
              {isSuperuser && !selectedSellerThread ? "Verkäufer auswählen" : "Thema auswählen oder „Neu“"}
            </Text>
          </div>
        ) : (
          <>
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="p" variant="bodyMd" fontWeight="semibold">{headerTitle()}</Text>
                {isSuperuser && selectedSellerThread?.seller_id && getSellerProfileHref(selectedSellerThread.seller_id) && (
                  <Button variant="plain" size="slim" url={getSellerProfileHref(selectedSellerThread.seller_id)}>
                    Profil →
                  </Button>
                )}
              </InlineStack>
            </Box>

            {loading && activeMessages.length === 0 && !isNewSubject ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Spinner size="small" />
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {isNewSubject && (
                  <Box paddingBlockEnd="200">
                    <Text as="p" variant="bodySm" tone="subdued">Erste Nachricht mit Betreff — danach erscheint das Thema in der Liste.</Text>
                  </Box>
                )}
                {activeMessages.length === 0 && !isNewSubject && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Text as="p" variant="bodySm" tone="subdued">Noch keine Nachrichten in diesem Thema.</Text>
                  </div>
                )}
                {activeMessages.map((m) => {
                  const isMe = isSuperuser ? m.sender_type === "seller" : m.sender_type === "customer";
                  const senderLabel = isMe ? null : (isSuperuser ? "Verkäufer" : "Support Team");
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "72%",
                        background: isMe ? "var(--p-color-bg-fill-brand, #ff971c)" : "var(--p-color-bg-surface-secondary)",
                        color: isMe ? "#fff" : "var(--p-color-text)",
                        borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                        padding: "9px 13px",
                        border: isMe ? "none" : "1px solid var(--p-color-border-subdued)",
                      }}>
                        {senderLabel && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--p-color-text-subdued)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".04em" }}>
                            {senderLabel}
                          </div>
                        )}
                        <Text as="p" variant="bodySm">{m.body}</Text>
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65 }}>{fmtDate(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}

            <Box padding="300" borderBlockStartWidth="025" borderColor="border">
              <BlockStack gap="200">
                {err && <Text as="p" variant="bodySm" tone="critical">{err}</Text>}
                {isNewSubject && (
                  <TextField label="Betreff" value={newSubject} onChange={setNewSubject} autoComplete="off" placeholder="z. B. Frage zu Auszahlung" />
                )}
                <InlineStack gap="200" blockAlign="end">
                  <div style={{ flex: 1 }}>
                    <TextField
                      value={reply}
                      onChange={setReply}
                      placeholder="Nachricht schreiben… (Enter zum Senden)"
                      multiline={2}
                      autoComplete="off"
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                  </div>
                  <Button variant="primary" onClick={handleSend} disabled={sending || !canSend()} loading={sending}>
                    Senden
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main InboxPage ──────────────────────────────────────────────────────────

export default function InboxPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [mySellerID, setMySellerID] = useState(null);
  const [sellerNames, setSellerNames] = useState({});
  const [sellerUserIds, setSellerUserIds] = useState({});
  const client = getMedusaAdminClient();

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    const sid = typeof window !== "undefined" ? localStorage.getItem("sellerId") : null;
    setIsSuperuser(su);
    setMySellerID(sid);
    // Superuser: map business seller_id → store name (support threads group by seller_id, not user UUID)
    if (su) {
      client.getSellers().then((data) => {
        const names = {};
        const userIds = {};
        for (const s of data?.sellers || []) {
          const label =
            (s.store_name && String(s.store_name).trim()) ||
            s.email ||
            s.company_name ||
            s.seller_id ||
            s.id;
          if (s.seller_id) {
            names[String(s.seller_id)] = label;
            if (s.id) userIds[String(s.seller_id)] = s.id;
          }
          if (s.id) names[String(s.id)] = label;
        }
        setSellerNames(names);
        setSellerUserIds(userIds);
      }).catch(() => {});
    }
  }, [client]);

  const tabs = [
    { id: "customer", content: "Kunden" },
    { id: "support", content: isSuperuser ? "Sellers" : "Support Team" },
  ];

  return (
    <Page title="Nachrichten">
      <div style={{ marginBottom: 0 }}>
        <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} fitted={false} />
      </div>
      <div style={{ marginTop: 12 }}>
        {activeTab === 0 && <CustomerInbox client={client} />}
        {activeTab === 1 && (
          <SupportInbox
            client={client}
            isSuperuser={isSuperuser}
            mySellerID={mySellerID}
            sellerNames={sellerNames}
            sellerUserIds={sellerUserIds}
          />
        )}
      </div>
    </Page>
  );
}
