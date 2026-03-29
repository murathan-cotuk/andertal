"use client";

import { useState, useEffect, useRef } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function groupByOrder(messages) {
  const map = {};
  for (const m of messages) {
    const key = m.order_id || "__no_order__";
    if (!map[key]) map[key] = { order_id: m.order_id, order_number: m.order_number, messages: [] };
    map[key].messages.push(m);
  }
  return Object.values(map).sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.created_at || "";
    const bLast = b.messages[b.messages.length - 1]?.created_at || "";
    return bLast.localeCompare(aLast);
  });
}

export default function InboxPage() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef(null);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const data = await getMedusaAdminClient().getMessages();
      if (!data?.__error) setThreads(groupByOrder(data?.messages || []));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMessages(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected]);

  const handleSelectThread = async (thread) => {
    setSelected(thread);
    setReply("");
    // Mark unread messages as read
    for (const m of thread.messages) {
      if (m.sender_type === "customer" && !m.is_read_by_seller) {
        getMedusaAdminClient().markMessageRead(m.id).catch(() => {});
      }
    }
  };

  const handleSend = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    setErr("");
    try {
      await getMedusaAdminClient().sendMessage({
        order_id: selected.order_id || undefined,
        body: reply.trim(),
        subject: selected.order_number ? `Re: Bestellung #${selected.order_number}` : "Nachricht",
      });
      setReply("");
      const data = await getMedusaAdminClient().getMessages();
      if (!data?.__error) {
        const updatedThreads = groupByOrder(data?.messages || []);
        setThreads(updatedThreads);
        const key = selected.order_id || "__no_order__";
        const updatedThread = updatedThreads.find((t) => (t.order_id || "__no_order__") === key);
        if (updatedThread) setSelected(updatedThread);
      }
    } catch (e) {
      setErr(e?.message || "Fehler");
    }
    setSending(false);
  };

  const unreadCount = (thread) =>
    thread.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_seller).length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 20px" }}>Nachrichten</h1>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, height: "calc(100vh - 180px)", minHeight: 400 }}>
        {/* Thread list */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid #f3f4f6" }}>
            Konversationen
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <div style={{ padding: 20, color: "#9ca3af", fontSize: 13, textAlign: "center" }}>Laden…</div>}
            {!loading && threads.length === 0 && (
              <div style={{ padding: 24, color: "#9ca3af", fontSize: 13, textAlign: "center" }}>Keine Nachrichten</div>
            )}
            {threads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              const unread = unreadCount(thread);
              const isActive = selected && (selected.order_id || "__no_order__") === (thread.order_id || "__no_order__");
              return (
                <button
                  key={thread.order_id || "__no_order__"}
                  onClick={() => handleSelectThread(thread)}
                  style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: isActive ? "#fff7ed" : "#fff", borderLeft: isActive ? "3px solid #ff971c" : "3px solid transparent", borderRight: "none", borderTop: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                      {thread.order_number ? `Bestellung #${thread.order_number}` : "Allgemein"}
                    </span>
                    {unread > 0 && (
                      <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{unread}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {last?.body?.slice(0, 60) || "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{fmtDate(last?.created_at)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message thread */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
              Konversation auswählen
            </div>
          ) : (
            <>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6", fontSize: 14, fontWeight: 700, color: "#111827" }}>
                {selected.order_number ? `Bestellung #${selected.order_number}` : "Allgemein"}
                {selected.order_id && (
                  <a href={`/orders/${selected.order_id}`} style={{ marginLeft: 10, fontSize: 12, color: "#ff971c", textDecoration: "none", fontWeight: 500 }}>Bestellung öffnen →</a>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                {selected.messages.map((m) => {
                  const isSeller = m.sender_type === "seller";
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isSeller ? "flex-end" : "flex-start" }}>
                      <div style={{ maxWidth: "70%", background: isSeller ? "#ff971c" : "#f3f4f6", color: isSeller ? "#fff" : "#111827", borderRadius: isSeller ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "10px 14px", fontSize: 13 }}>
                        <div style={{ fontWeight: 500 }}>{m.body}</div>
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{fmtDate(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div style={{ padding: "12px 18px", borderTop: "1px solid #f3f4f6" }}>
                {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Antwort schreiben… (Enter zum Senden)"
                    rows={2}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, resize: "none", outline: "none" }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !reply.trim()}
                    style={{ padding: "0 18px", background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 0 2px #000", flexShrink: 0 }}
                  >
                    {sending ? "…" : "Senden"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
