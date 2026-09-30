"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useTranslations } from "next-intl";

const NAV_ITEMS = [
  { category: "Navigation", label: "Home", labelKey: "nav.home", url: "/", keywords: "home dashboard" },
  { category: "Orders", label: "Orders", labelKey: "nav.orders", url: "/orders", keywords: "orders" },
  { category: "Orders", label: "Drafts", labelKey: "nav.drafts", url: "/orders/drafts", keywords: "drafts" },
  { category: "Orders", label: "Abandoned checkouts", labelKey: "nav.abandonedCheckouts", url: "/orders/abandoned-checkouts", keywords: "abandoned checkout" },
  { category: "Orders", label: "Returns", labelKey: "nav.returns", url: "/orders/returns", keywords: "returns" },
  { category: "Products", label: "Collections", labelKey: "nav.collections", url: "/products/collections", keywords: "collections" },
  { category: "Products", label: "Inventory", labelKey: "nav.inventory", url: "/products/inventory", keywords: "products inventory" },
  { category: "Products", label: "Gift Cards", labelKey: "nav.giftCards", url: "/products/gift-cards", keywords: "gift cards" },
  { category: "Products", label: "Bulk upload", labelKey: "globalSearch.bulkUpload", url: "/products/bulk-upload", keywords: "bulk upload" },
  { category: "Products", label: "Single upload", labelKey: "globalSearch.singleUpload", url: "/products/single-upload", keywords: "add product" },
  { category: "Customers", label: "Customers", labelKey: "nav.customers", url: "/customers", keywords: "customers" },
  { category: "Marketing", label: "Campaigns", labelKey: "nav.campaigns", url: "/marketing/campaigns", keywords: "campaigns" },
  { category: "Marketing", label: "Attribution", labelKey: "nav.attribution", url: "/marketing/attribution", keywords: "attribution" },
  { category: "Marketing", label: "SEO", labelKey: "nav.seo", url: "/marketing/seo", keywords: "seo meta search engine" },
  { category: "Marketing", label: "Automations", labelKey: "nav.automations", url: "/marketing/automations", keywords: "automations" },
  { category: "Navigation", label: "Discounts", labelKey: "nav.discounts", url: "/discounts", keywords: "discounts" },
  { category: "Content", label: "Categories", labelKey: "nav.categories", url: "/content/categories", keywords: "categories" },
  { category: "Content", label: "Media", labelKey: "nav.media", url: "/content/media", keywords: "media library upload" },
  { category: "Content", label: "Pages", labelKey: "nav.pages", url: "/content/pages", keywords: "pages cms" },
  { category: "Content", label: "Menus", labelKey: "nav.menus", url: "/content/menus", keywords: "menus" },
  { category: "Content", label: "Brands", labelKey: "nav.brands", url: "/content/brands", keywords: "brands" },
  { category: "Analytics", label: "Reports", labelKey: "nav.reports", url: "/analytics/reports", keywords: "reports analytics" },
  { category: "Analytics", label: "Ranking", labelKey: "globalSearch.ranking", url: "/analytics/ranking", keywords: "ranking produkt product score" },
  { category: "Analytics", label: "Live View", labelKey: "nav.liveView", url: "/analytics/live-view", keywords: "live" },
  { category: "Navigation", label: "Import/Export", labelKey: "nav.importExport", url: "/import-export", keywords: "import export bulk" },
  { category: "Settings", label: "Settings", labelKey: "nav.settings", url: "/settings", keywords: "settings" },
  { category: "Settings", label: "Shipping", labelKey: "globalSearch.shipping", url: "/settings/shipping", keywords: "shipping" },
  { category: "Settings", label: "Payments", labelKey: "globalSearch.payments", url: "/settings/payments", keywords: "payments" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function flattenMetaValues(meta) {
  if (!meta || typeof meta !== "object") return "";
  return Object.values(meta)
    .filter((v) => v != null && typeof v !== "object" && typeof v !== "boolean")
    .join(" ")
    .toLowerCase();
}

function productSearchText(p) {
  const meta = p.metadata || {};
  const parts = [
    p.title,
    p.handle,
    p.sku,
    p.description,
    meta.ean,
    meta.brand,
    meta.brand_name,
    flattenMetaValues(meta),
  ];
  // Variants: EAN, SKU, option_values
  if (Array.isArray(p.variants)) {
    for (const v of p.variants) {
      parts.push(v.ean, v.sku, v.title);
      if (Array.isArray(v.option_values)) parts.push(...v.option_values);
      const vm = v.metadata || {};
      parts.push(vm.ean, vm.sku, flattenMetaValues(vm));
    }
  }
  // Variation groups option values
  if (Array.isArray(p.variation_groups)) {
    for (const g of p.variation_groups) {
      if (Array.isArray(g.options)) {
        for (const o of g.options) {
          parts.push(o.value, o.label);
          if (o.labels && typeof o.labels === "object") parts.push(...Object.values(o.labels));
        }
      }
    }
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function orderSearchText(o) {
  const addr = o.billing_address || o.shipping_address || {};
  const name = [addr.first_name, addr.last_name, o.customer_name, o.customer_email].filter(Boolean).join(" ");
  return [
    o.id,
    o.display_id != null ? `#${o.display_id}` : "",
    o.order_number != null ? `#${o.order_number}` : "",
    o.email,
    name,
  ].filter(Boolean).join(" ").toLowerCase();
}

function customerSearchText(c) {
  return [c.id, c.email, c.first_name, c.last_name, `${c.first_name || ""} ${c.last_name || ""}`.trim()]
    .filter(Boolean).join(" ").toLowerCase();
}

function matchQ(text, q) {
  return q.split(/\s+/).filter(Boolean).every((token) => text.includes(token));
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 250;
const MAX_PER_SECTION = 5;

export default function GroupedDropdownSearch({ placeholder: placeholderProp }) {
  const tSearch = useTranslations("globalSearch");
  const tNav = useTranslations("nav");
  const placeholder = placeholderProp || tSearch("placeholder");
  const navLabel = (item) => {
    const [ns, key] = String(item.labelKey || "").split(".");
    if (ns === "nav") return tNav(key);
    if (ns === "globalSearch") return tSearch(key);
    return item.label;
  };
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [products, setProducts] = useState(null); // null = not loaded yet
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const loadedRef = useRef(false); // products fetched at least once

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search: fetch products once, orders+customers on every query
  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setIsOpen(false); return; }
    const client = getMedusaAdminClient();

    // Fetch products once and cache
    if (!loadedRef.current) {
      loadedRef.current = true;
      setLoading(true);
      try {
        const data = await client.getAdminHubProducts();
        setProducts(data.products || []);
      } catch (_) {
        setProducts([]);
      }
      setLoading(false);
    }

    // Fetch orders and customers with query (parallel)
    try {
      const [ordersRes, customersRes] = await Promise.allSettled([
        client.getOrders({ q, limit: 10 }),
        client.getCustomers({ q, limit: 10 }),
      ]);
      setOrders(ordersRes.status === "fulfilled" ? (ordersRes.value?.orders || []) : []);
      setCustomers(customersRes.status === "fulfilled" ? (customersRes.value?.customers || []) : []);
    } catch (_) {}

    setIsOpen(true);
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setIsOpen(false); return; }
    debounceRef.current = setTimeout(() => doSearch(q), DEBOUNCE_MS);
  };

  const close = () => { setQuery(""); setIsOpen(false); };

  const q = query.trim().toLowerCase();

  // ── Filter nav items ──
  const navHits = q
    ? NAV_ITEMS.filter((item) =>
        matchQ(`${item.label} ${navLabel(item)} ${item.keywords}`.toLowerCase(), q)
      ).slice(0, MAX_PER_SECTION)
    : [];

  // ── Filter products client-side ──
  const productHits = q && products
    ? products.filter((p) => matchQ(productSearchText(p), q)).slice(0, MAX_PER_SECTION)
    : [];

  // ── Filter orders client-side (from fetched) ──
  const orderHits = q
    ? orders.filter((o) => matchQ(orderSearchText(o), q)).slice(0, MAX_PER_SECTION)
    : [];

  // ── Filter customers client-side (from fetched) ──
  const customerHits = q
    ? customers.filter((c) => matchQ(customerSearchText(c), q)).slice(0, MAX_PER_SECTION)
    : [];

  const hasAny = navHits.length > 0 || productHits.length > 0 || orderHits.length > 0 || customerHits.length > 0;

  return (
    <div ref={wrapRef} className="andertal-search-wrap">
      <input
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => q && setIsOpen(true)}
        aria-expanded={isOpen}
        className="andertal-search-input"
      />
      {isOpen && q && (
        <div className="andertal-search-dropdown" role="listbox">
          {loading && (
            <div className="andertal-search-empty" style={{ fontStyle: "italic" }}>{tSearch("searching")}</div>
          )}

          {!loading && !hasAny && (
            <div className="andertal-search-empty">{tSearch("noResults", { query })}</div>
          )}

          {/* Products */}
          {productHits.length > 0 && (
            <div>
              <div className="andertal-search-category">
                {tSearch("products")} <span className="andertal-search-category-count">{productHits.length}</span>
              </div>
              {productHits.map((p) => {
                const meta = p.metadata || {};
                const sku = p.sku || p.variants?.[0]?.sku;
                const ean = meta.ean || p.variants?.[0]?.ean;
                const sub = [sku && `SKU: ${sku}`, ean && `EAN: ${ean}`].filter(Boolean).join(" · ");
                return (
                  <Link key={p.id} href={`/products/${p.id}`} className="andertal-search-hit" onClick={close}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span>{p.title || p.handle}</span>
                      {sub && <span style={{ fontSize: 11, opacity: 0.65 }}>{sub}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Orders */}
          {orderHits.length > 0 && (
            <div>
              <div className="andertal-search-category">
                {tSearch("orders")} <span className="andertal-search-category-count">{orderHits.length}</span>
              </div>
              {orderHits.map((o) => {
                const num = o.display_id != null ? `#${o.display_id}` : (o.order_number != null ? `#${o.order_number}` : o.id?.slice(0, 8));
                const addr = o.billing_address || o.shipping_address || {};
                const customerName = [addr.first_name, addr.last_name].filter(Boolean).join(" ") || o.customer_name || o.email || "";
                return (
                  <Link key={o.id} href={`/orders/${o.id}`} className="andertal-search-hit" onClick={close}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span>{num} {customerName && `· ${customerName}`}</span>
                      {o.email && <span style={{ fontSize: 11, opacity: 0.65 }}>{o.email}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Customers */}
          {customerHits.length > 0 && (
            <div>
              <div className="andertal-search-category">
                {tSearch("customers")} <span className="andertal-search-category-count">{customerHits.length}</span>
              </div>
              {customerHits.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
                return (
                  <Link key={c.id} href={`/customers/${c.id}`} className="andertal-search-hit" onClick={close}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span>{name}</span>
                      {c.email && name !== c.email && <span style={{ fontSize: 11, opacity: 0.65 }}>{c.email}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Navigation */}
          {navHits.length > 0 && (
            <div>
              <div className="andertal-search-category">
                {tSearch("navigation")} <span className="andertal-search-category-count">{navHits.length}</span>
              </div>
              {navHits.map((item) => (
                <Link key={item.url} href={item.url} className="andertal-search-hit" onClick={close}>
                  {navLabel(item)}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
