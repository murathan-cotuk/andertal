"use client";

export const saleBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "3px 6px",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  borderRadius: 4,
  color: "#fff",
  background: "#e11d48",
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.16)",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};

/** Compact sale pill for product cards and detail galleries. */
export default function SaleBadge({ children = "Sale", className, style }) {
  return (
    <span className={className} style={{ ...saleBadgeStyle, ...style }}>
      {children}
    </span>
  );
}

/** Absolute top-right overlay on a product image container. */
export function SaleBadgeImageCorner({ children = "Sale", inset = 8, style, badgeStyle }) {
  return (
    <div
      style={{
        position: "absolute",
        top: inset,
        right: inset,
        zIndex: 8,
        pointerEvents: "none",
        ...style,
      }}
    >
      <SaleBadge style={badgeStyle}>{children}</SaleBadge>
    </div>
  );
}
