"use client";

import React from "react";
import { Link } from "@/i18n/navigation";

import { useTranslations } from "next-intl";
/**
 * @param {{ label: string, href: string | null }[]} [props.items]
 */
export default function Breadcrumbs({ items: customItems }) {
  const tUi = useTranslations("shopUi");
  const items = Array.isArray(customItems) ? customItems.filter((i) => i?.label) : [];

  if (items.length === 0) return null;

  return (
    <nav data-breadcrumb="" aria-label={tUi("breadcrumb")} style={{ marginBottom: 18 }}>
      <ol style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", listStyle: "none", margin: 0, padding: 0, fontSize: 13 }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && (
              <span aria-hidden="true" style={{ color: "#5e574e", userSelect: "none" }}>›</span>
            )}
            {item.href ? (
              <Link
                href={item.href}
                style={{ color: "#5e574e", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--body-color, #1d1b18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#5e574e"; }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: "var(--body-color, #1d1b18)", fontWeight: 600 }}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
