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
// Superusers: see all sellers grouped by seller_id (left panel = seller list)
// Regular sellers: see their single thread with support team

function SupportInbox({ client, isSuperuser, mySellerID, sellerNames }) {
  const [threads, setThreads] = useState([]);   // for superuser: list of seller threads
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getSupportMessages();
      if (!data?.__error) {
        const msgs = data?.messages || [];
        if (isSuperuser) {
          setThreads(groupBySeller(msgs));
        } else {
          // Regular seller: single thread
          const sorted = [...msgs].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
          const singleThread = { seller_id: mySellerID, messages: sorted };
          setThreads([singleThread]);
          setSelected(singleThread);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [client, isSuperuser, mySellerID]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [selected?.messages?.length]);

  const handleSelectSellerThread = async (thread) => {
    setSelected(thread);
    setReply("");
    setErr("");
    // Mark seller messages as read by support
    if (isSuperuser && thread.seller_id) {
      client.markSupportMessagesRead(thread.seller_id, "support").catch(() => {});
    }
  };

  const handleSend = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    setErr("");
    try {
      if (isSuperuser) {
        // Superuser replies as support team to a seller
        await client.sendSupportMessage({
          body: reply.trim(),
          target_seller_id: selected.seller_id,
          sender_seller_id: null, // null = support side
        });
      } else {
        // Regular seller sends to support team
        await client.sendSupportMessage({
          body: reply.trim(),
          sender_seller_id: mySellerID,
        });
      }
      setReply("");
      const data = await client.getSupportMessages();
      if (!data?.__error) {
        const msgs = data?.messages || [];
        if (isSuperuser) {
          const updated = groupBySeller(msgs);
          setThreads(updated);
          const upd = updated.find((t) => t.seller_id === selected.seller_id);
          if (upd) setSelected(upd);
        } else {
          const sorted = [...msgs].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
          const singleThread = { seller_id: mySellerID, messages: sorted };
          setThreads([singleThread]);
          setSelected(singleThread);
        }
      }
    } catch (e) {
      setErr(e?.message || "Fehler beim Senden");
    }
    setSending(false);
  };

  const unreadForThread = (thread) => {
    if (isSuperuser) {
      // Superuser: unread = seller messages not yet read by support
      return thread.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_support).length;
    } else {
      // Seller: unread = support messages not yet read by seller
      return thread.messages.filter((m) => m.sender_type === "seller" && !m.is_read_by_seller).length;
    }
  };

  const getSellerLabel = (seller_id) => {
    if (!seller_id) return "Unbekannt";
    return sellerNames[seller_id] || seller_id.slice(0, 12) + "…";
  };

  // For superusers: show left panel with seller list. For sellers: just show the thread.
  const showLeftPanel = isSuperuser;

  return (
    <div style={{ display: "grid", gridTemplateColumns: showLeftPanel ? "280px 1fr" : "1fr", gap: 12, height: "calc(100vh - 220px)", minHeight: 500 }}>

      {/* Left panel: seller list (superuser only) */}
      {showLeftPanel && (
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
          <Box padding="300" borderBlockEndWidth="025" borderColor="border">
            <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Verkäufer</Text>
          </Box>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <Box padding="400"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>}
            {!loading && threads.length === 0 && (
              <Box padding="400"><Text as="p" variant="bodySm" tone="subdued" alignment="center">Keine Nachrichten</Text></Box>
            )}
            {threads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              const unread = unreadForThread(thread);
              const isActive = selected?.seller_id === thread.seller_id;
              return (
                <div key={thread.seller_id || "__unknown__"} style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <button
                    onClick={() => handleSelectSellerThread(thread)}
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
                          <span style={{ background: "var(--p-color-bg-fill-critical)", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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

      {/* Message thread */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text as="p" variant="bodySm" tone="subdued">Verkäufer auswählen</Text>
          </div>
        ) : (
          <>
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {isSuperuser ? getSellerLabel(selected.seller_id) : "Support Team"}
                </Text>
                {isSuperuser && selected.seller_id && (
                  <Button variant="plain" size="slim" url={`/sellers/${selected.seller_id}`}>
                    Profil →
                  </Button>
                )}
              </InlineStack>
            </Box>

            {loading && !selected.messages?.length ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Spinner size="small" />
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {selected.messages.length === 0 && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Text as="p" variant="bodySm" tone="subdued">Noch keine Nachrichten. Schreib etwas!</Text>
                  </div>
                )}
                {selected.messages.map((m) => {
                  // isSuperuser: 'seller' sender_type = support side (right), 'customer' = seller side (left)
                  // regular seller: 'customer' = seller side (right), 'seller' = support side (left)
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
                  <Button variant="primary" onClick={handleSend} disabled={sending || !reply.trim()} loading={sending}>
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
  const client = getMedusaAdminClient();

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    const sid = typeof window !== "undefined" ? localStorage.getItem("sellerId") : null;
    setIsSuperuser(su);
    setMySellerID(sid);
    // If superuser, prefetch seller display names
    if (su) {
      client.getSellers().then((data) => {
        const names = {};
        for (const s of data?.sellers || []) {
          names[s.id] = s.store_name || s.email || s.id;
        }
        setSellerNames(names);
      }).catch(() => {});
    }
  }, []);

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
          />
        )}
      </div>
    </Page>
  );
}
