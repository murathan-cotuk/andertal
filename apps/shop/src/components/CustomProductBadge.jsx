"use client";

function positionStyle(b) {
  const style = { position: "absolute", zIndex: 9, pointerEvents: "none" };
  const ox = Number(b.offset_x) || 0;
  const oy = Number(b.offset_y) || 0;
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

/** Single superuser-configured text badge, absolutely positioned over a product image. */
export default function CustomProductBadge({ badge }) {
  if (!badge || !badge.label) return null;
  return (
    <div style={positionStyle(badge)}>
      <span style={visualStyle(badge)}>{badge.label}</span>
    </div>
  );
}

/** Renders every custom badge resolved for a product (product.metadata.custom_badges). */
export function CustomProductBadges({ badges }) {
  if (!Array.isArray(badges) || badges.length === 0) return null;
  return (
    <>
      {badges.map((b) => (
        <CustomProductBadge key={b.id} badge={b} />
      ))}
    </>
  );
}
