"use client";

// Two badges sharing the same corner would otherwise render at the exact same absolute
// coordinates and overlap illegibly — stackIndex nudges each subsequent one down by one
// badge-height so a superuser can safely assign multiple badges to one product/corner.
const STACK_GAP_PX = 26;

function positionStyle(b, stackIndex = 0) {
  const style = { position: "absolute", zIndex: 9, pointerEvents: "none" };
  const ox = Number(b.offset_x) || 0;
  const oy = (Number(b.offset_y) || 0) + stackIndex * STACK_GAP_PX;
  if (b.position === "top-left") { style.top = oy; style.left = ox; }
  else if (b.position === "top-right") { style.top = oy; style.right = ox; }
  else if (b.position === "bottom-left") { style.bottom = oy; style.left = ox; }
  else { style.bottom = oy; style.right = ox; }
  return style;
}

function visualStyle(b) {
  return {
    background: b.bg_color || "#e53935",
    color: b.text_color || "#ffffff",
    fontSize: Number(b.font_size) || 12,
    borderWidth: Number(b.border_width) || 0,
    borderStyle: "solid",
    borderColor: b.border_color || "#000000",
    borderRadius: Number(b.border_radius) || 0,
    padding: "3px 8px",
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.16)",
  };
}

// Same _i18n[locale][field]-style convention as landing containers, but badges store
// their per-locale overrides under `i18n` (not `_i18n`) — DE always falls back to the
// root label/image_url columns.
function bt(badge, field, locale) {
  if (!locale || locale === "de") return badge?.[field] ?? "";
  return badge?.i18n?.[locale]?.[field] ?? badge?.[field] ?? "";
}

/** Single superuser-configured badge (text or image), absolutely positioned over a product image. */
export default function CustomProductBadge({ badge, stackIndex = 0, locale }) {
  if (!badge) return null;
  if (badge.badge_type === "image") {
    const imageUrl = bt(badge, "image_url", locale);
    if (!imageUrl) return null;
    return (
      <div style={positionStyle(badge, stackIndex)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={bt(badge, "label", locale) || ""}
          style={{ display: "block", maxWidth: 80, maxHeight: 80, boxShadow: "0 1px 4px rgba(0, 0, 0, 0.16)" }}
        />
      </div>
    );
  }
  const label = bt(badge, "label", locale);
  if (!label) return null;
  return (
    <div style={positionStyle(badge, stackIndex)}>
      <span style={visualStyle(badge)}>{label}</span>
    </div>
  );
}

/** Renders every custom badge resolved for a product (product.metadata.custom_badges). */
export function CustomProductBadges({ badges, locale }) {
  if (!Array.isArray(badges) || badges.length === 0) return null;
  const seenAtPosition = {};
  return (
    <>
      {badges.map((b) => {
        const stackIndex = seenAtPosition[b.position] || 0;
        seenAtPosition[b.position] = stackIndex + 1;
        return <CustomProductBadge key={b.id} badge={b} stackIndex={stackIndex} locale={locale} />;
      })}
    </>
  );
}
