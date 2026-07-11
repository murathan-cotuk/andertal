"use client";

import BestsellerBadge from "@/components/BestsellerBadge";
import { SaleBadgeImageCorner } from "@/components/SaleBadge";

/**
 * Bestseller (top-left) + Sale (top-right) over product images on PDP.
 */
export default function ProductImageBadges({ isBestseller, hasSale, isComingSoon, saleLabel = "Sale" }) {
  if (isComingSoon || (!isBestseller && !hasSale)) return null;
  return (
    <>
      {isBestseller && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 8,
            pointerEvents: "none",
          }}
        >
          <BestsellerBadge />
        </div>
      )}
      {hasSale && <SaleBadgeImageCorner>{saleLabel}</SaleBadgeImageCorner>}
    </>
  );
}
