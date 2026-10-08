"use client";

import { computeGrundpreis } from "@/lib/grundpreis";
import { formatPriceCents } from "@/lib/format";

/**
 * Grundpreis under a listing price (PAngV §4: shown wherever the price is shown, also in
 * listings). Renders nothing unless the seller entered the content quantity — product cards
 * without unit data look exactly as before.
 */
export default function CardGrundpreis({ productMeta, variantMeta, cents, style }) {
  const gp = computeGrundpreis(productMeta || {}, variantMeta || {}, cents, formatPriceCents);
  if (!gp) return null;
  return (
    <div style={{ fontSize: 11, lineHeight: 1.3, color: "#6b6b6b", marginTop: 2, ...style }}>
      {gp.contentLabel} {gp.display}
    </div>
  );
}
