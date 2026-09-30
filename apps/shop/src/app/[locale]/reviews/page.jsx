"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthGuard, getToken } from "@andertal/lib";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import { useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";
import { useLocale, useTranslations } from "next-intl";
import { useCustomerAuth as useAuth } from "@andertal/lib";

const ORANGE = "var(--shop-accent, #ee8a12)";
const DARK = "var(--body-color, #1d1b18)";
const GRAY = "#5e574e";
const BORDER = "#efe8dd";

function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 28, color: (hovered || value) >= n ? "#f59e0b" : "#d1d5db", lineHeight: 1 }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ value }) {
  const stars = Number(value) || 0;
  return (
    <span style={{ fontSize: 18, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ color: stars >= n ? "#f59e0b" : "#d1d5db" }}>★</span>
      ))}
    </span>
  );
}

function fmtDate(d, locale = "de") {
  if (!d) return "";
  return new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ReviewForm({ orderId, item, existing, onSaved, trustpilotEvaluateUrl }) {
  const t = useTranslations("accountMisc");
  const [rating, setRating] = useState(existing?.rating || 0);
  const [comment, setComment] = useState(existing?.comment || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!rating) { setErr(t("pickRating")); return; }
    setSaving(true); setErr("");
    try {
      const token = getToken("customer");
      const client = getMedusaClient();
      await client.request("/store/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, product_id: item.product_id, rating, comment }),
      });
      setDone(true);
      onSaved({ order_id: orderId, product_id: item.product_id, rating, comment });
    } catch (e) {
      setErr(e?.message || t("saveError"));
    }
    setSaving(false);
  };

  if (done) {
    return (
      <div style={{ padding: "12px 16px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "#15803d", fontWeight: 600 }}>{t("reviewSaved")}</p>
        <StarDisplay value={rating} />
        {comment && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#374151" }}>{comment}</p>}
        {trustpilotEvaluateUrl ? (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
            {t("trustpilotOptional")}{" "}
            <a href={trustpilotEvaluateUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#048068", fontWeight: 600 }}>
              {t("toTrustpilot")}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px", background: "#fafafa", borderRadius: 8, border: `1px solid ${BORDER}`, marginTop: 4 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: DARK }}>{item.title}</p>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder={t("commentPlaceholder")}
        style={{ width: "100%", marginTop: 10, padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
      />
      {err && <p style={{ color: "#ef4444", fontSize: 12, margin: "6px 0 0" }}>{err}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        style={{ marginTop: 10, padding: "8px 18px", background: ORANGE, color: "#fff", border: "1px solid #e6dfd4", borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 0 0 1px rgba(29,27,24,0.08)" }}
      >
        {saving ? "…" : existing ? t("update") : t("submitReview")}
      </button>
    </div>
  );
}

export default function ReviewsPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const t = useTranslations("accountMisc");
  const locale = useLocale();
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderParam = searchParams.get("order");
  const [orders, setOrders] = useState([]);
  const [reviews, setReviews] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [trustpilotEvaluateUrl, setTrustpilotEvaluateUrl] = useState(null);

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
    fetch(`${base}/store/trustpilot-config`)
      .then((r) => r.json())
      .then((d) => setTrustpilotEvaluateUrl(typeof d?.evaluateUrl === "string" && d.evaluateUrl ? d.evaluateUrl : null))
      .catch(() => setTrustpilotEvaluateUrl(null));
  }, []);

  const load = useCallback(async () => {
    const token = getToken("customer");
    if (!token) return;
    const client = getMedusaClient();
    const [ordersRes, reviewsRes] = await Promise.all([
      client.request("/store/orders/me", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      client.request("/store/reviews/my", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
    ]);
    setOrders(ordersRes?.orders || []);
    const rvMap = {};
    for (const rv of (reviewsRes?.reviews || [])) {
      rvMap[`${rv.order_id}:${rv.product_id}`] = rv;
    }
    setReviews(rvMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [user?.id, load]);

  // Deep-link from review-request emails ({REVIEW_URL} = /reviews?order=<id>) — jump straight
  // to that order's review form instead of leaving the customer to find it in the list.
  useEffect(() => {
    if (!orderParam || loading) return;
    if (orders.some((o) => o.id === orderParam)) setExpandedOrder(orderParam);
  }, [orderParam, orders, loading]);

  const handleSaved = (rv) => {
    const key = `${rv.order_id}:${rv.product_id}`;
    setReviews((prev) => ({ ...prev, [key]: rv }));
    setEditingKey(null);
  };

  const ordersWithItems = orders.filter((o) => (o.items || []).some((it) => it.product_id));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title={t("reviewsTitle")}>
            <div>
              {loading && <GlobalPageLoader />}
              {!loading && ordersWithItems.length === 0 && (
                <p style={{ color: GRAY }}>{t("noOrders")}</p>
              )}
              {ordersWithItems.map((order) => {
                const isOpen = expandedOrder === order.id;
                const items = (order.items || []).filter((it) => it.product_id);
                const reviewedCount = items.filter((it) => reviews[`${order.id}:${it.product_id}`]).length;
                const allReviewed = reviewedCount === items.length && items.length > 0;
                const avgRating = reviewedCount > 0
                  ? (items.reduce((s, it) => s + (reviews[`${order.id}:${it.product_id}`]?.rating || 0), 0) / reviewedCount)
                  : null;

                return (
                  <div key={order.id} style={{ background: "#fff", boxShadow: "0 0 0 1px rgba(29, 27, 24, 0.06)", borderRadius: 18, marginBottom: 14, overflow: "hidden" }}>
                    <div
                      style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                      onClick={() => setExpandedOrder(isOpen ? null : order.id)}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: DARK }}>
                          {t("orderNumber", { number: order.order_number || "—" })}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: GRAY }}>
                          {fmtDate(order.created_at, locale)} · {t("productCount", { count: items.length })}
                          {reviewedCount > 0 && ` · ${t("reviewedCount", { done: reviewedCount, total: items.length })}`}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {avgRating != null ? (
                          <span style={{ fontSize: 16, letterSpacing: 1 }}>
                            {[1,2,3,4,5].map((n) => (
                              <span key={n} style={{ color: Math.round(avgRating) >= n ? "#f59e0b" : "#d1d5db" }}>★</span>
                            ))}
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: ORANGE, fontWeight: 600 }}>{t("reviewNow")}</span>
                        )}
                        <span style={{ color: GRAY, fontSize: 14 }}>{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${BORDER}`, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                        {items.map((item) => {
                          const key = `${order.id}:${item.product_id}`;
                          const existing = reviews[key];
                          const isEditing = editingKey === key;

                          return (
                            <div key={item.product_id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                              {item.thumbnail && (
                                <img src={item.thumbnail} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {existing && !isEditing ? (
                                  <div style={{ padding: "10px 14px", background: "#f9fafb", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{item.title}</p>
                                      <span style={{ fontSize: 16, letterSpacing: 1 }}>
                                        {[1,2,3,4,5].map((n) => (
                                          <span key={n} style={{ color: existing.rating >= n ? "#f59e0b" : "#d1d5db" }}>★</span>
                                        ))}
                                      </span>
                                    </div>
                                    {existing.comment && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>{existing.comment}</p>}
                                    {trustpilotEvaluateUrl ? (
                                      <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                                        <a href={trustpilotEvaluateUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#048068", fontWeight: 600 }}>
                                          {t("alsoTrustpilot")}
                                        </a>
                                      </p>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => setEditingKey(key)}
                                      style={{ marginTop: 8, fontSize: 12, color: ORANGE, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                    >
                                      {t("edit")}
                                    </button>
                                  </div>
                                ) : (
                                  <ReviewForm
                                    orderId={order.id}
                                    item={item}
                                    existing={isEditing ? existing : null}
                                    onSaved={handleSaved}
                                    trustpilotEvaluateUrl={trustpilotEvaluateUrl}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
