"use client";

import React, { useState, useEffect } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function fmtCents(c) {
  return (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
}

function ExpandedCart({ cart }) {
  const items = cart.items || [];
  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, background: "#f9fafb" }}>
        <div style={{ padding: "12px 24px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Produkt</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Menge</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Einzelpreis</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "8px", color: "#9ca3af", textAlign: "center" }}>Keine Artikel</td></tr>
              )}
              {items.map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {it.thumbnail && <img src={it.thumbnail} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />}
                      <span>{it.title || "—"}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{it.quantity}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{fmtCents(it.unit_price_cents)}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>{fmtCents((it.unit_price_cents || 0) * (it.quantity || 1))}</td>
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
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const client = getMedusaAdminClient();
        const data = await client.getAbandonedCarts();
        setCarts(data.carts || []);
      } catch { setCarts([]); }
      setLoading(false);
    })();
  }, []);

  const COLS = ["", "Kunde", "Email", "Artikel", "Wert", "Erstellt", "Zuletzt aktiv"];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Abgebrochene Checkouts</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Warenkörbe, die nicht abgeschlossen wurden</p>
        </div>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{carts.length} Warenkörbe</span>
      </div>

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {COLS.map((c, i) => (
                <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Laden…</td></tr>
            )}
            {!loading && carts.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "60px 20px", textAlign: "center", color: "#9ca3af" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
                  <div>Keine abgebrochenen Checkouts</div>
                </td>
              </tr>
            )}
            {carts.map((cart) => (
              <React.Fragment key={cart.id}>
                <tr
                  style={{ borderBottom: "1px solid #f3f4f6" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <td style={{ padding: "10px 8px 10px 12px", width: 32 }}>
                    <button onClick={() => setExpanded(e => ({ ...e, [cart.id]: !e[cart.id] }))}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", padding: 0 }}>
                      {expanded[cart.id] ? "▼" : "▶"}
                    </button>
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                    {[cart.first_name, cart.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{isSuperuser ? (cart.email || "—") : "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#eff6ff", color: "#1d4ed8" }}>
                      {cart.item_count || 0} Artikel
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                    {fmtCents(cart.cart_total)}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280" }}>{fmtDate(cart.created_at)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280" }}>{fmtDate(cart.updated_at)}</td>
                </tr>
                {expanded[cart.id] && <ExpandedCart cart={cart} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
