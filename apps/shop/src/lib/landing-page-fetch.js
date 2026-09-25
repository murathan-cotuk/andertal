/**
 * Shared by the /api/store-landing-page proxy route AND the homepage's server-side render
 * (apps/shop/src/app/[locale]/page.jsx) — keeps the fetch URL, revalidate window, and the
 * `{ __error }` failure shape identical across both, so SSR-fetched data and the client-fetch
 * fallback in LandingContainers.jsx can never drift into different shapes and cause a hydration
 * mismatch.
 */
import { isDiscountedProduct, isWithinNewWindow } from "@/lib/catalog-listing";
import { toSalesScore } from "@/lib/bestseller";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function walkContainers(list, out = []) {
  for (const c of list || []) {
    if (!c || c.visible === false) continue;
    out.push(c);
    if (Array.isArray(c.children)) walkContainers(c.children, out);
  }
  return out;
}

export function bestsellerPreloadKey(c) {
  const mode = c?.mode === "sale" ? "sale" : c?.mode === "newest" ? "newest" : "bestseller";
  const slug = String(c?.category_slug || "").trim();
  const limit = Number(c?.limit);
  return `${mode}|${slug}|${Number.isFinite(limit) && limit > 0 ? limit : ""}`;
}

function discountPct(product) {
  const meta = product?.metadata || {};
  const dePrice = meta.prices?.DE;
  const base = dePrice?.brutto_cents != null ? Number(dePrice.brutto_cents) : null;
  const sale = dePrice?.sale_cents != null ? Number(dePrice.sale_cents) : (meta.rabattpreis_cents != null ? Number(meta.rabattpreis_cents) : null);
  if (!base || sale == null || sale <= 0 || sale >= base) return 0;
  return 1 - sale / base;
}

function productRecencyMs(product) {
  const raw = product?.metadata?.publish_date || product?.created_at || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

async function fetchProductsQuery(qs) {
  const res = await fetch(`${getBackendUrl()}/store/products?${qs}`, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 15 },
  });
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.products) ? data.products : [];
}

async function landingBadgeRules() {
  try {
    const res = await fetch(`${getBackendUrl()}/store/seller-settings?seller_id=default`, {
      next: { revalidate: 30 },
    });
    const data = await res.json().catch(() => ({}));
    const days = Number(data?.new_product_window_days);
    const salePct = Number(data?.sale_min_discount_percent);
    return {
      days: Number.isFinite(days) && days >= 1 ? days : 15,
      salePct: Number.isFinite(salePct) && salePct >= 0 ? salePct : 0,
    };
  } catch {
    return { days: 15, salePct: 0 };
  }
}

/** One parallel batch for every product a landing page's containers need. */
export async function hydrateLandingPreload(containers) {
  const all = walkContainers(containers);
  const collectionTargets = new Map();
  const singleTargets = new Set();
  const bestsellerTargets = new Map();
  for (const c of all) {
    if (c.type === "collection_carousel" || (c.type === "content_mosaic" && String(c.source || "images") === "collection")) {
      const key = `${String(c.collection_id || "").trim()}|${String(c.collection_handle || "").trim()}`;
      if (key === "|") continue;
      const needLimit = c.type === "content_mosaic" ? 100 : 20;
      const prev = collectionTargets.get(key);
      if (!prev || needLimit > prev.limit) collectionTargets.set(key, { c, limit: needLimit });
    } else if (c.type === "single_product") {
      const id = String(c.product_id || c.product_handle || "").trim();
      if (id) singleTargets.add(id);
    } else if (c.type === "bestseller_carousel") {
      bestsellerTargets.set(bestsellerPreloadKey(c), c);
    }
  }
  const rules = bestsellerTargets.size ? await landingBadgeRules() : { days: 15, salePct: 0 };
  const [collectionEntries, singleEntries, bestsellerEntries] = await Promise.all([
    Promise.all([...collectionTargets.entries()].map(async ([key, entry]) => {
      const c = entry.c;
      const param = c.collection_id
        ? `collection_id=${encodeURIComponent(c.collection_id)}`
        : `collection_handle=${encodeURIComponent(c.collection_handle)}`;
      try {
        return [key, await fetchProductsQuery(`${param}&limit=${entry.limit}`)];
      } catch {
        return [key, []];
      }
    })),
    Promise.all([...singleTargets].map(async (id) => {
      try {
        const res = await fetch(`${getBackendUrl()}/store/products/${encodeURIComponent(id)}`, {
          next: { revalidate: 15 },
        });
        const data = await res.json().catch(() => ({}));
        return [id, data?.product || null];
      } catch {
        return [id, null];
      }
    })),
    Promise.all([...bestsellerTargets.entries()].map(async ([key, c]) => {
      try {
        const slug = String(c.category_slug || "").trim();
        const qs = new URLSearchParams({ limit: "50" });
        if (slug) qs.set("category", slug);
        let next = await fetchProductsQuery(qs.toString());
        const mode = c.mode === "sale" ? "sale" : c.mode === "newest" ? "newest" : "bestseller";
        if (mode === "sale") next = next.filter((p) => isDiscountedProduct(p, rules.salePct)).sort((a, b) => discountPct(b) - discountPct(a));
        else if (mode === "newest") next = next.filter((p) => isWithinNewWindow(p, rules.days)).sort((a, b) => productRecencyMs(b) - productRecencyMs(a));
        else next = [...next].sort((a, b) => toSalesScore(b.metadata) - toSalesScore(a.metadata));
        const limit = Number(c.limit);
        if (Number.isFinite(limit) && limit > 0) next = next.slice(0, limit);
        return [key, next];
      } catch {
        return [key, []];
      }
    })),
  ]);
  return {
    collectionProducts: Object.fromEntries(collectionEntries),
    singleProducts: Object.fromEntries(singleEntries),
    bestsellers: Object.fromEntries(bestsellerEntries),
  };
}

export async function fetchLandingPage(suffix = "", { revalidate = 0 } = {}) {
  try {
    const base = getBackendUrl();
    const pageSpecific = String(suffix || "").length > 0;
    const res = await fetch(`${base}/store/landing-page${suffix}`, {
      headers: { "Content-Type": "application/json" },
      ...(pageSpecific || revalidate === 0
        ? { cache: "no-store" }
        : { next: { revalidate } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { __error: true, status: res.status, message: data?.message || res.statusText };
    }
    if (Array.isArray(data?.containers) && data.containers.length) {
      data.preload = await hydrateLandingPreload(data.containers);
    }
    return data;
  } catch (e) {
    return { __error: true, status: 0, message: e?.message || "Network error" };
  }
}
