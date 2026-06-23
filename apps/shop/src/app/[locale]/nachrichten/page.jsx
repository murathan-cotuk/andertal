"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCustomerAuth as useAuth, useAuthGuard, getToken } from "@andertal/lib";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";

const ORANGE = "#ff971c";
const BACKEND = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function dateLocaleFor(locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (loc === "en") return "en-GB";
  if (loc === "tr") return "tr-TR";
  if (loc === "fr") return "fr-FR";
  if (loc === "es") return "es-ES";
  if (loc === "it") return "it-IT";
  return "de-DE";
}

function stripHtmlTags(html) {
  return String(html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function MessageBody({ body }) {
  const raw = String(body || "");
  const looksHtml = /<[a-z][\s\S]*>/i.test(raw);
  if (!looksHtml) return <span>{raw}</span>;
  const safe = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s(on\w+|javascript:)\s*=/gi, " data-blocked=");
  return <span dangerouslySetInnerHTML={{ __html: safe }} />;
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

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#6b7280", padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
    >
      ←
    </button>
  );
}

export default function NachrichtenPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  const router = useRouter();
  const locale = useLocale();
  const tm = useTranslations("pages.messages");
  const tAccount = useTranslations("pages.account");
  const dateLoc = dateLocaleFor(locale);

  const fmtDate = (d) => {
    if (!d) return "";
    return new Date(d).toLocaleString(dateLoc, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const fmtShort = (d) => {
    if (!d) return "";
    const now = new Date();
    const dt = new Date(d);
    if (dt.toDateString() === now.toDateString()) return dt.toLocaleTimeString(dateLoc, { hour: "2-digit", minute: "2-digit" });
    return dt.toLocaleDateString(dateLoc, { day: "2-digit", month: "2-digit" });
  };

  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [composing, setComposing] = useState(false);
  const [composeOrderId, setComposeOrderId] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [myOrders, setMyOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [storeName, setStoreName] = useState("Shop");
  const bottomRef = useRef(null);

  const threadTitle = (thread) =>
    (thread?.order_number ? tm("referenceOrder", { number: thread.order_number }) : tm("generalThread"));

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

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const token = getToken("customer");
      if (!token) return;
      const res = await getMedusaClient().request("/store/orders/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res?.__error) setMyOrders(res?.orders || []);
    } catch (_) {
      setMyOrders([]);
    }
    setOrdersLoading(false);
  }, []);

  const markRead = useCallback(async (thread) => {
    if (!user?.email) return;
    await fetch(`${BACKEND}/store/messages/mark-read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, order_id: thread.order_id || null }),
    }).catch(() => {});
  }, [user?.email]);

  const openCompose = async () => {
    setComposing(true);
    setSelected(null);
    setComposeOrderId("");
    setComposeSubject("");
    setComposeBody("");
    setReply("");
    setErr("");
    setSent(false);
    await loadOrders();
  };

  const closeCompose = () => {
    setComposing(false);
    setComposeOrderId("");
    setComposeSubject("");
    setComposeBody("");
    setErr("");
    setSent(false);
  };

  const handleSelectThread = async (thread) => {
    setComposing(false);
    setSelected(thread);
    setReply("");
    setErr("");
    setSent(false);
    await markRead(thread);
    setThreads((prev) => prev.map((t) =>
      (t.order_id || "__no_order__") === (thread.order_id || "__no_order__")
        ? { ...t, messages: t.messages.map((m) => m.sender_type === "seller" ? { ...m, is_read_by_customer: true } : m) }
        : t
    ));
  };

  const refreshAndSelectThread = async (orderId) => {
    const token = getToken("customer");
    const data = await getMedusaClient().request("/store/messages", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data?.__error) return;
    const updated = groupByOrder(data?.messages || []);
    setThreads(updated);
    const key = orderId || "__no_order__";
    const updatedThread = updated.find((t) => (t.order_id || "__no_order__") === key);
    if (updatedThread) {
      setSelected(updatedThread);
      setComposing(false);
    }
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
          subject: selected.order_number
            ? tm("reOrderSubject", { number: selected.order_number })
            : tm("defaultSubject"),
        }),
      });
      setReply("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      await refreshAndSelectThread(selected.order_id || null);
    } catch (e) {
      setErr(e?.message || tm("error"));
    }
    setSending(false);
  };

  const handleComposeSend = async () => {
    if (!composeBody.trim()) return;
    setSending(true);
    setErr("");
    setSent(false);
    try {
      const token = getToken("customer");
      const picked = myOrders.find((o) => o.id === composeOrderId);
      const orderNumber = picked?.order_number;
      const subject = composeSubject.trim()
        || (orderNumber ? tm("reOrderSubject", { number: orderNumber }) : tm("defaultSubject"));

      await getMedusaClient().request("/store/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: composeOrderId || undefined,
          body: composeBody.trim(),
          subject,
        }),
      });
      setComposeBody("");
      setComposeSubject("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      await refreshAndSelectThread(composeOrderId || null);
      setComposeOrderId("");
    } catch (e) {
      setErr(e?.message || tm("error"));
    }
    setSending(false);
  };

  const unreadCount = (thread) =>
    thread.messages.filter((m) => m.sender_type === "seller" && !m.is_read_by_customer).length;

  const customerName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : tm("you");
  const youLabel = tm("you");

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const labelStyle = { fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" };

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", display: "flex", flexDirection: "column" }}>
      <ShopHeader />
      <main style={{ flex: 1, width: "100%", boxSizing: "border-box" }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title={tm("title")}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {loading ? (
                <GlobalPageLoader />
              ) : composing ? (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 12, background: "#fafafa" }}>
                    <BackButton onClick={closeCompose} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{tm("composeTitle")}</div>
                  </div>
                  <div style={{ padding: "20px 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{tm("composeHint")}</p>
                    <div>
                      <label htmlFor="msg-ref" style={labelStyle}>{tm("referenceLabel")}</label>
                      <select
                        id="msg-ref"
                        value={composeOrderId}
                        onChange={(e) => setComposeOrderId(e.target.value)}
                        disabled={ordersLoading}
                        style={inputStyle}
                      >
                        <option value="">{tm("referenceGeneral")}</option>
                        {myOrders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {tm("referenceOrder", { number: o.order_number || o.id?.slice(0, 8) })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="msg-subject" style={labelStyle}>{tm("subjectLabel")}</label>
                      <input
                        id="msg-subject"
                        type="text"
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        placeholder={tm("subjectPlaceholder")}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="msg-body" style={labelStyle}>{tm("messageLabel")}</label>
                      <textarea
                        id="msg-body"
                        value={composeBody}
                        onChange={(e) => setComposeBody(e.target.value)}
                        placeholder={tm("messagePlaceholder")}
                        rows={6}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                      />
                    </div>
                    {sent && <div style={{ color: "#15803d", fontSize: 12 }}>{tm("sent")}</div>}
                    {err && <div style={{ color: "#ef4444", fontSize: 12 }}>{err}</div>}
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={closeCompose}
                        style={{ padding: "10px 18px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151" }}
                      >
                        {tAccount("cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={handleComposeSend}
                        disabled={sending || !composeBody.trim()}
                        style={{
                          padding: "10px 22px",
                          background: ORANGE,
                          color: "#fff",
                          border: "none",
                          borderRadius: 10,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: sending || !composeBody.trim() ? "not-allowed" : "pointer",
                          opacity: sending || !composeBody.trim() ? 0.6 : 1,
                        }}
                      >
                        {sending ? tm("sending") : tm("send")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : selected ? (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 12, background: "#fafafa" }}>
                    <BackButton onClick={() => setSelected(null)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{threadTitle(selected)}</div>
                      {selected.order_id && (
                        <div
                          onClick={() => router.push(`/order/${selected.order_id}`)}
                          style={{ fontSize: 11, color: ORANGE, cursor: "pointer", fontWeight: 600, marginTop: 1 }}
                        >
                          {tm("viewOrder")}
                        </div>
                      )}
                    </div>
                  </div>

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
                              wordBreak: "break-word",
                            }}>
                              <MessageBody body={m.body} />
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

                  <div style={{ padding: "12px 16px", borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
                    {sent && <div style={{ color: "#15803d", fontSize: 12, marginBottom: 6 }}>{tm("sent")}</div>}
                    {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>{err}</div>}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder={tm("replyPlaceholder")}
                        rows={2}
                        style={{ flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 }}
                      />
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={sending || !reply.trim()}
                        style={{ padding: "10px 20px", background: ORANGE, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: sending || !reply.trim() ? "not-allowed" : "pointer", opacity: sending || !reply.trim() ? 0.6 : 1, flexShrink: 0, height: 44 }}
                      >
                        {sending ? tm("sending") : tm("send")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={openCompose}
                      style={{
                        padding: "10px 18px",
                        background: ORANGE,
                        color: "#fff",
                        border: "none",
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        boxShadow: "0 2px 0 2px #000",
                      }}
                    >
                      + {tm("newMessage")}
                    </button>
                  </div>

                  {threads.length === 0 ? (
                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 48, textAlign: "center" }}>
                      <div style={{ color: "#9ca3af", fontSize: 14, marginBottom: 8 }}>{tm("empty")}</div>
                      <div style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>{tm("emptyHint")}</div>
                    </div>
                  ) : (
                    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                      {threads.map((thread, idx) => {
                        const last = thread.messages[thread.messages.length - 1];
                        const unread = unreadCount(thread);
                        const lastSenderName = last?.sender_type === "seller" ? storeName : youLabel;
                        return (
                          <button
                            key={thread.order_id || "__no_order__"}
                            type="button"
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
                            onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
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
                                  {threadTitle(thread)}
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
                                {stripHtmlTags(last?.body || "").slice(0, 70) || "—"}
                              </div>
                            </div>
                            <div style={{ color: "#d1d5db", fontSize: 18, flexShrink: 0 }}>›</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
