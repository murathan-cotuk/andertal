"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCustomerAuth as useAuth, useAuthGuard, getToken } from "@belucha/lib";
import NewtonsCradle from "@/components/NewtonsCradle";
import { useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountSidebar from "@/components/account/AccountSidebar";
import { getMedusaClient } from "@/lib/medusa-client";

const ORANGE = "#ff971c";
const BACKEND = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtShort(d) {
  if (!d) return "";
  const now = new Date();
  const dt = new Date(d);
  if (dt.toDateString() === now.toDateString()) return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function groupByOrder(messages) {
  const map = {};
  for (const m of messages) {
    const key = m.order_id || "__no_order__";
    if (!map[key]) map[key] = { order_id: m.order_id, order_number: m.order_number, messages: [] };
    map[key].messages.push(m);
  }
  return Object.values(map)
    .map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")) }))
    .sort((a, b) => {
      const aL = a.messages[a.messages.length - 1]?.created_at || "";
      const bL = b.messages[b.messages.length - 1]?.created_at || "";
      return bL.localeCompare(aL);
    });
}

function Avatar({ name, size = 36, color = "#ff971c" }) {
  const initials = (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0, userSelect: "none",
    }}>
      {initials}
    </div>
  );
}

export default function NachrichtenPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  const router = useRouter();
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [storeName, setStoreName] = useState("Shop");
  const bottomRef = useRef(null);

  useEffect(() => {
    getMedusaClient().request("/store/seller-settings")
      .then((r) => { if (r?.store_name) setStoreName(r.store_name); })
      .catch(() => {});
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken("customer");
      const data = await getMedusaClient().request("/store/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!data?.__error) setThreads(groupByOrder(data?.messages || []));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [selected?.messages?.length]);

  const markRead = useCallback(async (thread) => {
    if (!user?.email) return;
    await fetch(`${BACKEND}/store/messages/mark-read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, order_id: thread.order_id || null }),
    }).catch(() => {});
  }, [user?.email]);

  const handleSelectThread = async (thread) => {
    setSelected(thread);
    setReply("");
    setErr("");
    setSent(false);
    await markRead(thread);
    // Update local state to clear unread badges
    setThreads((prev) => prev.map((t) =>
      (t.order_id || "__no_order__") === (thread.order_id || "__no_order__")
        ? { ...t, messages: t.messages.map((m) => m.sender_type === "seller" ? { ...m, is_read_by_customer: true } : m) }
        : t
    ));
  };

  const handleSend = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    setErr("");
    setSent(false);
    try {
      const token = getToken("customer");
      await getMedusaClient().request("/store/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: selected.order_id || undefined,
          body: reply.trim(),
          subject: selected.order_number ? `Re: Bestellung #${selected.order_number}` : "Nachricht",
        }),
      });
      setReply("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      const data = await getMedusaClient().request("/store/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!data?.__error) {
        const updated = groupByOrder(data?.messages || []);
        setThreads(updated);
        const key = selected.order_id || "__no_order__";
        const updatedThread = updated.find((t) => (t.order_id || "__no_order__") === key);
        if (updatedThread) setSelected(updatedThread);
      }
    } catch (e) {
      setErr(e?.message || "Fehler");
    }
    setSending(false);
  };

  const unreadCount = (thread) =>
    thread.messages.filter((m) => m.sender_type === "seller" && !m.is_read_by_customer).length;

  const customerName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : "Du";

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column" }}>
      <ShopHeader />
      <div style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "40px 24px 64px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "start" }}>
        <AccountSidebar />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: "0 0 16px" }}>Nachrichten</h1>

          {loading ? (
            <NewtonsCradle />
          ) : threads.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 12, padding: 48, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Noch keine Nachrichten</div>
          ) : selected ? (
            /* ── Thread view ── */
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 12, background: "#fafafa" }}>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#6b7280", padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                >
                  ←
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                    {selected.order_number ? `Bestellung #${selected.order_number}` : "Allgemeine Nachricht"}
                  </div>
                  {selected.order_id && (
                    <div
                      onClick={() => router.push(`/order/${selected.order_id}`)}
                      style={{ fontSize: 11, color: ORANGE, cursor: "pointer", fontWeight: 600, marginTop: 1 }}
                    >
                      Bestellung ansehen →
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16, minHeight: 240, maxHeight: 440, overflowY: "auto" }}>
                {selected.messages.map((m) => {
                  const isCustomer = m.sender_type === "customer";
                  const name = isCustomer ? customerName : storeName;
                  const avatarColor = isCustomer ? ORANGE : "#374151";
                  return (
                    <div key={m.id} style={{ display: "flex", gap: 10, flexDirection: isCustomer ? "row-reverse" : "row", alignItems: "flex-end" }}>
                      <Avatar name={name} size={32} color={avatarColor} />
                      <div style={{ maxWidth: "70%" }}>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, textAlign: isCustomer ? "right" : "left", fontWeight: 500 }}>
                          {name}
                        </div>
                        <div style={{
                          background: isCustomer ? ORANGE : "#f3f4f6",
                          color: isCustomer ? "#fff" : "#111827",
                          borderRadius: isCustomer ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                          padding: "10px 14px",
                          fontSize: 13,
                          lineHeight: 1.55,
                        }}>
                          {m.body}
                        </div>
                        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, textAlign: isCustomer ? "right" : "left" }}>
                          {fmtDate(m.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Reply */}
              <div style={{ padding: "12px 16px", borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
                {sent && <div style={{ color: "#15803d", fontSize: 12, marginBottom: 6 }}>Nachricht gesendet ✓</div>}
                {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Antwort schreiben… (Enter zum Senden)"
                    rows={2}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !reply.trim()}
                    style={{ padding: "10px 20px", background: ORANGE, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: sending || !reply.trim() ? "not-allowed" : "pointer", opacity: sending || !reply.trim() ? 0.6 : 1, flexShrink: 0, height: 44 }}
                  >
                    {sending ? "…" : "Senden"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Thread list ── */
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              {threads.map((thread, idx) => {
                const last = thread.messages[thread.messages.length - 1];
                const unread = unreadCount(thread);
                const lastSenderName = last?.sender_type === "seller" ? storeName : "Du";
                return (
                  <button
                    key={thread.order_id || "__no_order__"}
                    onClick={() => handleSelectThread(thread)}
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "16px 20px",
                      background: "#fff",
                      border: "none",
                      borderBottom: idx < threads.length - 1 ? "1px solid #f3f4f6" : "none",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 14,
                      transition: "background .12s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: unread > 0 ? "#fff7ed" : "#f3f4f6",
                      border: unread > 0 ? `2px solid ${ORANGE}` : "2px solid #e5e7eb",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 18,
                    }}>
                      ✉️
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: unread > 0 ? 700 : 500, color: "#111827" }}>
                          {thread.order_number ? `Bestellung #${thread.order_number}` : "Allgemeine Nachricht"}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {unread > 0 && (
                            <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {unread}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtShort(last?.created_at)}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: unread > 0 ? "#374151" : "#9ca3af", fontWeight: unread > 0 ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ color: "#6b7280" }}>{lastSenderName}: </span>
                        {last?.body?.slice(0, 70) || "—"}
                      </div>
                    </div>
                    <div style={{ color: "#d1d5db", fontSize: 18, flexShrink: 0 }}>›</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
