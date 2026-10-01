"use client";

import { useTranslations } from "next-intl";
import { formatPriceCents } from "@/lib/format";

/**
 * Per-seller shipping lines + "X € more at <seller> for free shipping" hints, from
 * computeSellerShipping(). Every seller has their own rules, so a mixed cart shows one line
 * per seller; a single-seller cart only shows the hint (the summary row already has the total).
 */
export default function SellerShippingBreakdown({ sellerShipping, compact = false }) {
  const tUi = useTranslations("shopUi");
  const sellers = sellerShipping?.sellers || [];
  if (!sellers.length) return null;
  const multi = sellers.length > 1;
  const nameOf = (s) => s.sellerStoreName || tUi("sellerShippingMarketplace");
  const fs = compact ? "0.75rem" : "0.8125rem";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: compact ? "2px 0 6px" : "4px 0 8px" }}>
      {multi &&
        sellers.map((s) => (
          <div
            key={`line-${s.sellerId}`}
            style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: fs, color: "#6b7280" }}
          >
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tUi("sellerShippingLine", { seller: nameOf(s) })}
            </span>
            <span style={{ flexShrink: 0, color: s.free ? "#16a34a" : undefined, fontWeight: s.free ? 600 : 400 }}>
              {s.free ? tUi("sellerShippingFree") : `${formatPriceCents(s.shippingCents)} €`}
            </span>
          </div>
        ))}
      {sellers
        .filter((s) => s.remainingCents != null && s.remainingCents > 0 && s.shippingCents > 0)
        .map((s) => (
          <div key={`hint-${s.sellerId}`} style={{ fontSize: fs, color: "#15803d", lineHeight: 1.4 }}>
            {tUi("sellerFreeShippingHint", { amount: formatPriceCents(s.remainingCents), seller: nameOf(s) })}
          </div>
        ))}
    </div>
  );
}
