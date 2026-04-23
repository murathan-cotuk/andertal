"use client";

import React from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { restPathFromPathname } from "@/lib/shop-market";

/**
 * @param {Object} props
 * @param {string} [props.title] - Override label for the last segment
 * @param {{ label: string, href: string | null }[]} [props.items] - Custom breadcrumb items (e.g. Home, Collection, Product). If set, pathname is ignored.
 */
export default function Breadcrumbs({ title, items: customItems }) {
  const pathname = usePathname() || "";
  const crumbPath = restPathFromPathname(pathname);
  const segments = crumbPath.split("/").filter(Boolean);

  let items;
  if (Array.isArray(customItems) && customItems.length > 0) {
    items = customItems;
  } else {
    items = [{ label: "Home", href: "/" }];
    let href = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const skip = segment === "product" || segment === "collections";
      if (skip) {
        href += "/" + segment;
        continue;
      }
      href += "/" + segment;
      const isLast = i === segments.length - 1;
      const label = isLast && title ? title : decodeURIComponent(segment.replace(/-/g, " "));
      items.push({ label, href: isLast ? null : href });
    }
  }

  if (items.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden md:block text-sm text-gray-500 mb-4">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-400">/</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-gray-700 transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-gray-900 font-medium">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
