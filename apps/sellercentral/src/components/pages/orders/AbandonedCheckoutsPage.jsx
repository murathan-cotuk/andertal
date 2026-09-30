"use client";

import React, { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { lt } from "@/lib/locale-text";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getAbandonedCheckoutsCopy } from "@/lib/abandoned-checkouts-i18n";

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  const dt = new Date(d);
  return dt.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + dt.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
}

function fmtCents(c, locale) {
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  return (Number(c || 0) / 100).toLocaleString(loc, { minimumFractionDigits: 2 }) + " €";
}

const STATUS_STYLE = {
  in_cart: { bg: "#fcebd5", color: "#7f3f00" },
  purchased: { bg: "#f0fdf4", color: "#15803d" },
  deleted: { bg: "#fef2f2", color: "#b91c1c" },
};

function StatusBadge({ status, copy }) {
  const label = status === "purchased" ? copy.statusPurchased : status === "deleted" ? copy.statusDeleted : copy.statusInCart;
  const s = STATUS_STYLE[status] || STATUS_STYLE.in_cart;
  return (
    <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function ExpandedCart({ cart, locale }) {
  const c = getAbandonedCheckoutsCopy(locale);
  const items = cart.items || [];
  return (
    <tr>
      <td colSpan={9} style={{ padding: 0, background: "#faf7f2" }}>
        <div style={{ padding: "12px 24px 16px", borderBottom: "1px solid #e6dfd4" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#5e574e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>{c.product}</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>{c.qty}</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>{c.unitPrice}</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>{c.total}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "8px", color: "#a39a8d", textAlign: "center" }}>{c.noItems}</td></tr>
              )}
              {items.map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid #e6dfd4" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {it.thumbnail && <img src={it.thumbnail} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />}
                      <span>{it.title || "—"}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{it.quantity}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{fmtCents(it.unit_price_cents, locale)}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>{fmtCents((it.unit_price_cents || 0) * (it.quantity || 1), locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

export default function AbandonedCheckoutsPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const c = getAbandonedCheckoutsCopy(locale);
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [tab, setTab] = useState("all");
  const [markingId, setMarkingId] = useState(null);
  const [bulkMarking, setBulkMarking] = useState(false);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);

  const loadCarts = async () => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.getAbandonedCarts();
      setCarts(data.carts || []);
    } catch { setCarts([]); }
    setLoading(false);
  };

  useEffect(() => { loadCarts(); }, []);

  const markRemoved = async (cartId) => {
    setMarkingId(cartId);
    try {
      const client = getMedusaAdminClient();
      await client.markAbandonedCartRemoved(cartId);
      setCarts((prev) => prev.map((c) => (c.id === cartId ? { ...c, status: "deleted", item_count: 0, items: [] } : c)));
    } catch { /* leave as-is; user can retry */ }
    setMarkingId(null);
  };

  const bulkMarkRemoved = async () => {
    if (!window.confirm(c.bulkMarkConfirm(counts.in_cart))) return;
    setBulkMarking(true);
    try {
      const client = getMedusaAdminClient();
      await client.bulkMarkAbandonedCartsRemoved();
      await loadCarts();
    } catch { /* keep current list on failure */ }
    setBulkMarking(false);
  };

  const COLS = ["", c.customer, c.email, c.items, c.value, c.created, c.lastActive, c.status, ""];

  const counts = {
    all: carts.length,
    in_cart: carts.filter((cart) => cart.status === "in_cart").length,
    purchased: carts.filter((cart) => cart.status === "purchased").length,
    deleted: carts.filter((cart) => cart.status === "deleted").length,
  };
  const TABS = [
    { key: "all", label: c.tabAll },
    { key: "in_cart", label: c.tabInCart },
    { key: "purchased", label: c.tabPurchased },
    { key: "deleted", label: c.tabDeleted },
  ];
  const filteredCarts = tab === "all" ? carts : carts.filter((cart) => cart.status === tab);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{c.pageTitle}</h1>
          <p style={{ fontSize: 13, color: "#5e574e", margin: "4px 0 0" }}>{c.pageSubtitle}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#5e574e" }}>{filteredCarts.length} {c.carts}</span>
          {counts.in_cart > 0 && (
            <button
              onClick={bulkMarkRemoved}
              disabled={bulkMarking}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e6dfd4", background: "#fff", color: "#3a352f", fontSize: 13, fontWeight: 600, cursor: bulkMarking ? "default" : "pointer" }}
            >
              {bulkMarking ? c.bulkMarking : c.bulkMarkRemovedBtn}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: tab === t.key ? "1px solid #a65300" : "1px solid #e6dfd4",
              background: tab === t.key ? "#fcebd5" : "#fff",
              color: tab === t.key ? "#7f3f00" : "#3a352f",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e6dfd4", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#faf7f2", borderBottom: "1px solid #e6dfd4" }}>
              {COLS.map((c, i) => (
                <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#5e574e", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#a39a8d" }}>{ui.loading}</td></tr>
            )}
            {!loading && filteredCarts.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "60px 20px", textAlign: "center", color: "#a39a8d" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
                  <div>{c.noCheckouts}</div>
                </td>
              </tr>
            )}
            {filteredCarts.map((cart) => (
              <React.Fragment key={cart.id}>
                <tr
                  style={{ borderBottom: "1px solid #f3eee6" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#faf7f2"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <td style={{ padding: "10px 8px 10px 12px", width: 32 }}>
                    <button onClick={() => setExpanded(e => ({ ...e, [cart.id]: !e[cart.id] }))}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#5e574e", padding: 0 }}>
                      {expanded[cart.id] ? "▼" : "▶"}
                    </button>
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                    {[cart.first_name, cart.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#5e574e" }}>{isSuperuser ? (cart.email || "—") : "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#fcebd5", color: "#7f3f00" }}>
                      {c.itemCount(cart.item_count || 0)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                    {fmtCents(cart.cart_total, locale)}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#5e574e" }}>{fmtDate(cart.created_at, locale)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#5e574e" }}>{fmtDate(cart.updated_at, locale)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={cart.status} copy={c} />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {cart.status === "in_cart" && (
                      <button
                        onClick={() => markRemoved(cart.id)}
                        disabled={markingId === cart.id}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e6dfd4", background: "#fff", color: "#3a352f", fontSize: 11, fontWeight: 600, cursor: markingId === cart.id ? "default" : "pointer", whiteSpace: "nowrap" }}
                      >
                        {markingId === cart.id ? c.marking : c.markRemoved}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded[cart.id] && <ExpandedCart cart={cart} locale={locale} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
