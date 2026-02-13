"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";

const SEARCHABLE_ITEMS = [
  { category: "Navigation", label: "Home", url: "/", keywords: "home dashboard" },
  { category: "Orders", label: "Orders", url: "/orders", keywords: "orders" },
  { category: "Orders", label: "Drafts", url: "/orders/drafts", keywords: "drafts" },
  { category: "Orders", label: "Abandoned checkouts", url: "/orders/abandoned-checkouts", keywords: "abandoned checkout" },
  { category: "Orders", label: "Returns", url: "/orders/returns", keywords: "returns" },
  { category: "Products", label: "Collections", url: "/products/collections", keywords: "collections" },
  { category: "Products", label: "Inventory", url: "/products/inventory", keywords: "products inventory" },
  { category: "Products", label: "Gift Cards", url: "/products/gift-cards", keywords: "gift cards" },
  { category: "Products", label: "Bulk upload", url: "/products/bulk-upload", keywords: "bulk upload" },
  { category: "Products", label: "Single upload", url: "/products/single-upload", keywords: "add product" },
  { category: "Customers", label: "Customers", url: "/customers", keywords: "customers" },
  { category: "Marketing", label: "Campaigns", url: "/marketing/campaigns", keywords: "campaigns" },
  { category: "Marketing", label: "Attribution", url: "/marketing/attribution", keywords: "attribution" },
  { category: "Marketing", label: "Automations", url: "/marketing/automations", keywords: "automations" },
  { category: "Navigation", label: "Discounts", url: "/discounts", keywords: "discounts" },
  { category: "Content", label: "Categories", url: "/content/categories", keywords: "categories" },
  { category: "Content", label: "Metaobjects", url: "/content/metaobjects", keywords: "metaobjects" },
  { category: "Content", label: "Files", url: "/content/files", keywords: "files media" },
  { category: "Content", label: "Menus", url: "/content/menus", keywords: "menus" },
  { category: "Content", label: "Blog Posts", url: "/content/blog-posts", keywords: "blog" },
  { category: "Content", label: "Brands", url: "/content/brands", keywords: "brands" },
  { category: "Analytics", label: "Reports", url: "/analytics/reports", keywords: "reports analytics" },
  { category: "Analytics", label: "Live View", url: "/analytics/live-view", keywords: "live" },
  { category: "Navigation", label: "Import/Export", url: "/import-export", keywords: "import export bulk" },
  { category: "Settings", label: "Settings", url: "/settings", keywords: "settings" },
  { category: "Settings", label: "General", url: "/settings/general", keywords: "general" },
  { category: "Settings", label: "Plan", url: "/settings/plan", keywords: "plan" },
  { category: "Settings", label: "Billing", url: "/settings/billing", keywords: "billing" },
  { category: "Settings", label: "Users and Permissions", url: "/settings/users-permissions", keywords: "users permissions" },
  { category: "Settings", label: "Payments", url: "/settings/payments", keywords: "payments" },
  { category: "Settings", label: "Checkout", url: "/settings/checkout", keywords: "checkout" },
  { category: "Settings", label: "Shipping and delivery", url: "/settings/shipping", keywords: "shipping" },
  { category: "Settings", label: "Taxes and duties", url: "/settings/taxes", keywords: "taxes" },
  { category: "Settings", label: "Locations", url: "/settings/locations", keywords: "locations" },
  { category: "Settings", label: "Notifications", url: "/settings/notifications", keywords: "notifications" },
  { category: "Navigation", label: "Profile", url: "/profile", keywords: "profile" },
  { category: "Navigation", label: "Store", url: "/store", keywords: "store" },
];

function matchQuery(item, q) {
  const qLower = q.trim().toLowerCase();
  if (!qLower) return false;
  const label = (item.label || "").toLowerCase();
  const keywords = (item.keywords || "").toLowerCase();
  return label.includes(qLower) || keywords.includes(qLower);
}

const MAX_HITS_PER_CATEGORY = 5;

export default function GroupedDropdownSearch({ placeholder = "Search products, orders, customers..." }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = query.trim()
    ? SEARCHABLE_ITEMS.filter((item) => matchQuery(item, query))
    : [];

  const byCategory = filtered.reduce((acc, item) => {
    const c = item.category || "Other";
    if (!acc[c]) acc[c] = [];
    acc[c].push(item);
    return acc;
  }, {});

  const categories = Object.keys(byCategory).sort();
  const showDropdown = query.length > 0;

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    setIsOpen(showDropdown);
  }, [showDropdown]);

  return (
    <div ref={wrapRef} className="belucha-search-wrap">
      <span className="belucha-search-icon" aria-hidden>🔍</span>
      <input
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.length > 0 && setIsOpen(true)}
        aria-expanded={showDropdown}
        className="belucha-search-input"
      />
      {showDropdown && (
        <div className="belucha-search-dropdown" role="listbox">
          {filtered.length === 0 && (
            <div className="belucha-search-empty">No results for &quot;{query}&quot;</div>
          )}
          {categories.map((cat) => {
            const items = byCategory[cat];
            const count = items.length;
            const displayItems = items.slice(0, MAX_HITS_PER_CATEGORY);
            return (
              <div key={cat}>
                <div className="belucha-search-category">
                  {cat}
                  <span className="belucha-search-category-count">{count}</span>
                </div>
                {displayItems.map((item) => (
                  <Link
                    key={`${item.url}-${item.label}`}
                    href={item.url}
                    className="belucha-search-hit"
                    onClick={() => {
                      setQuery("");
                      setIsOpen(false);
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
