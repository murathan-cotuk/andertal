"use client";

import React from "react";
import { Link } from "@/i18n/navigation";

/**
 * @param {{ label: string, href: string | null }[]} [props.items]
 */
export default function Breadcrumbs({ items: customItems }) {
  const items = Array.isArray(customItems) ? customItems.filter((i) => i?.label) : [];

  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: 12 }}>
      <ol style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 6px", listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && (
              <span style={{ color: "#9ca3af", fontSize: 12, userSelect: "none" }}>›</span>
            )}
            {item.href ? (
              <Link
                href={item.href}
                style={{ color: "#9ca3af", fontSize: 12, textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#6b7280"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: "#9ca3af", fontSize: 12 }}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
