"use client";

import BestsellerBadge from "@/components/BestsellerBadge";
import { SaleBadgeImageCorner } from "@/components/SaleBadge";
import { CustomProductBadges } from "@/components/CustomProductBadge";

/**
 * Bestseller (top-left) + Sale (top-right) + superuser-configured custom badges over product images on PDP.
 */
export default function ProductImageBadges({ isBestseller, hasSale, isComingSoon, saleLabel = "Sale", customBadges }) {
  const badges = Array.isArray(customBadges) ? customBadges : [];
  if (isComingSoon || (!isBestseller && !hasSale && badges.length === 0)) return null;
  // A custom badge in the same corner as a built-in one takes priority to avoid overlap.
  const hasCustomTopLeft = badges.some((b) => b.position === "top-left");
  const hasCustomTopRight = badges.some((b) => b.position === "top-right");
  return (
    <>
      {isBestseller && !hasCustomTopLeft && (
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
      {hasSale && !hasCustomTopRight && <SaleBadgeImageCorner>{saleLabel}</SaleBadgeImageCorner>}
      <CustomProductBadges badges={badges} />
    </>
  );
}
