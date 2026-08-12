"use client";

import { CustomProductBadges } from "@/components/CustomProductBadge";

/**
 * Superuser-configured product badges (Content → Styles → Product Badges) over product images.
 * Built-in Sale/Bestseller overlays are intentionally omitted — only Sellercentral badges render.
 */
export default function ProductImageBadges({ isComingSoon, customBadges, locale }) {
  const badges = Array.isArray(customBadges) ? customBadges : [];
  if (isComingSoon || badges.length === 0) return null;
  return <CustomProductBadges badges={badges} locale={locale} />;
}
