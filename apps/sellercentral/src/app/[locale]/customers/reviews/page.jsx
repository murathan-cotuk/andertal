"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const selStyle = {
  padding: "7px 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 7,
  fontSize: 13,
  background: "#fff",
  color: "#374151",
  cursor: "pointer",
};

function Stars({ rating }) {
  const n = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return (
    <span style={{ fontSize: 14, letterSpacing: 1 }}>
      <span style={{ color: "#f59e0b" }}>{"★".repeat(n)}</span>
      <span style={{ color: "#d1d5db" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

const COL_KEYS = ["customer", "product_sku", "rating", "comment", "created_at"];

function CustomerReviewsPage() {
  const params = useParams();
  const router = useRouter();
  const locale = params?.locale || "de";

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [sort, setSort] = useState({ col: "created_at", dir: "desc" });
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);

  useEffect(() => {
    getMedusaAdminClient()
      .request("/admin-hub/reviews")
      .then((d) => setReviews(d?.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (col) => {
    setSort((s) => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }));
  };

  const sortIcon = (col) => {
    if (sort.col !== col) return <span style={{ opacity: 0.3, marginLeft: 3 }}>↕</span>;
    return <span style={{ marginLeft: 3 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>;
  };

  const filtered = useMemo(() => {
    let list = [...reviews];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          (r.customer_name || (isSuperuser ? r.customer_email : "") || "").toLowerCase().includes(q) ||
          (r.customer_number || "").toLowerCase().includes(q) ||
          (r.product_sku || "").toLowerCase().includes(q) ||
          (r.product_title || "").toLowerCase().includes(q) ||
          (r.comment || "").toLowerCase().includes(q)
      );
    }
    if (filterRating) list = list.filter((r) => String(r.rating) === filterRating);

    list.sort((a, b) => {
      let va = a[sort.col] ?? "";
      let vb = b[sort.col] ?? "";
      if (sort.col === "rating") { va = Number(va); vb = Number(vb); }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [reviews, search, filterRating, sort]);

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : "—";

  return (
    <div style={{ padding: 24, background: "#fff", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Kundenbewertungen</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {!loading && (
            <>
              <span style={{ fontSize: 13, color: "#6b7280" }}>{filtered.length} Bewertung{filtered.length !== 1 ? "en" : ""}</span>
              {reviews.length > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "#fef3c7", color: "#92400e", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: "#f59e0b" }}>★</span> {avgRating} Ø
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Suche nach Kunde, SKU, Kommentar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13 }}
        />
        <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)} style={selStyle}>
          <option value="">Alle Sterne</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)}{"☆".repeat(5 - n)} — {reviews.filter((r) => r.rating === n).length}×
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {[
                { label: "Kunde", col: "customer_name" },
                { label: "SKU / Produkt", col: "product_sku" },
                { label: "Bewertung", col: "rating" },
                { label: "Kommentar", col: "comment" },
                { label: "Datum", col: "created_at" },
              ].map(({ label, col }) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: 11,
                    color: "#374151",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  {label}{sortIcon(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Laden…</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Keine Bewertungen gefunden</td>
              </tr>
            )}
            {filtered.map((r, i) => (
              <tr
                key={i}
                style={{ borderBottom: "1px solid #f3f4f6" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                {/* Kunde */}
                <td style={{ padding: "10px 12px", minWidth: 180 }}>
                  {r.customer_id ? (
                    <button
                      onClick={() => router.push(`/${locale}/customers/${r.customer_id}`)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                    >
                      {r.customer_number && (
                        <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>#{r.customer_number}</div>
                      )}
                      <div style={{ fontWeight: 600, color: "#111827", textDecoration: "underline", fontSize: 13 }}>
                        {r.customer_name || (isSuperuser ? r.customer_email : null) || "—"}
                      </div>
                    </button>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{r.customer_name || (isSuperuser ? r.customer_email : null) || "—"}</div>
                    </div>
                  )}
                </td>

                {/* SKU / Produkt */}
                <td style={{ padding: "10px 12px", minWidth: 160 }}>
                  {r.product_sku && (
                    <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "ui-monospace, monospace", marginBottom: 2 }}>{r.product_sku}</div>
                  )}
                  <div style={{ color: "#374151" }}>{r.product_title || r.product_id || "—"}</div>
                </td>

                {/* Bewertung */}
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                  <Stars rating={r.rating} />
                </td>

                {/* Kommentar */}
                <td style={{ padding: "10px 12px", color: "#6b7280", maxWidth: 400 }}>
                  {r.comment || <span style={{ color: "#d1d5db" }}>—</span>}
                </td>

                {/* Datum */}
                <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
                  {fmtDate(r.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CustomerReviewsPageWrapper() {
  return (
    <DashboardLayout>
      <CustomerReviewsPage />
    </DashboardLayout>
  );
}
