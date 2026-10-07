"use client";

/**
 * Review summary (Konsept s3): average, count and the share of each star level — computed from
 * the reviews already loaded for the product (verified purchases only, no invented numbers).
 */
const L = (d, locale) => d[String(locale || "de").slice(0, 2)] ?? d.de;
const tx = {
  of5: { de: "von 5", en: "out of 5", tr: "/ 5", fr: "sur 5", it: "su 5", es: "de 5" },
  reviews: { de: "Bewertungen", en: "reviews", tr: "değerlendirme", fr: "avis", it: "recensioni", es: "valoraciones" },
};

export default function RatingDistribution({ reviews, locale }) {
  const list = (Array.isArray(reviews) ? reviews : []).filter((r) => Number(r?.rating) >= 1 && Number(r?.rating) <= 5);
  if (!list.length) return null;
  const counts = [5, 4, 3, 2, 1].map((n) => list.filter((r) => Math.round(Number(r.rating)) === n).length);
  const avg = list.reduce((s, r) => s + Number(r.rating), 0) / list.length;
  const avgText = avg.toLocaleString(locale === "en" ? "en-GB" : "de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", marginTop: 16 }}>
      <div>
        <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: "#191919" }}>{avgText}</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{L(tx.of5, locale)} · {list.length} {L(tx.reviews, locale)}</div>
      </div>
      <div style={{ flex: "1 1 260px", maxWidth: 420, display: "grid", gap: 6 }}>
        {[5, 4, 3, 2, 1].map((n, i) => {
          const pct = Math.round((counts[i] / list.length) * 100);
          return (
            <div key={n} style={{ display: "grid", gridTemplateColumns: "34px 1fr 40px", alignItems: "center", gap: 8, fontSize: 13, color: "#374151" }}>
              <span>{n} ★</span>
              <span style={{ height: 8, background: "#f3eee6", borderRadius: 999, overflow: "hidden" }} aria-hidden>
                <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "#ee8a12", borderRadius: 999 }} />
              </span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct} %</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
