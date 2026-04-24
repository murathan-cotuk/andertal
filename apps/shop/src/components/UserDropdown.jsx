"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { getToken } from "@belucha/lib";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { getMedusaClient } from "@/lib/medusa-client";

/* ─── Trigger icon (ShopHeader) ─── */
function PersonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

const ICONS = {
  overview: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  orders: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6m-6 4h4" />
    </svg>
  ),
  wishlist: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  addresses: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  reviews: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  bonus: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" rx="1" />
      <line x1="12" y1="22" x2="12" y2="7" />
    </svg>
  ),
  payment: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  messages: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  logout: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

function shortTitle(raw) {
  const m = (raw || "").match(/^(.*)\s+\(.+\)$/);
  return m ? m[1] : (raw || "");
}

const REPEAT_BUY_STATUSES = new Set([
  "versendet", "zugestellt", "abgeschlossen", "shipped", "delivered", "completed", "bezahlt",
  "retoure", "retoure_anfrage",
]);

function orderItemToCard(item) {
  if (!item?.product_id || !item?.product_handle) return null;
  return {
    id: String(item.product_id),
    handle: String(item.product_handle).replace(/^\//, ""),
    title: shortTitle(item.title) || "—",
    thumbnail: item.thumbnail || null,
  };
}

function productToCard(p) {
  if (!p?.id) return null;
  const h = p.handle || p.id;
  if (!h) return null;
  return {
    id: String(p.id),
    handle: String(h).replace(/^\//, ""),
    title: (p.title || "—").slice(0, 80),
    thumbnail: p.thumbnail || null,
  };
}

function isShippedOrDoneOrder(o) {
  const a = String(o?.order_status || "").toLowerCase();
  const b = String(o?.delivery_status || "").toLowerCase();
  if (a === "storniert" || a === "cancelled" || a === "refunded") return false;
  if (REPEAT_BUY_STATUSES.has(a) || REPEAT_BUY_STATUSES.has(b)) return true;
  return false;
}

function buildOrderProductLists(orders) {
  const sorted = [...(orders || [])].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  );
  const fromOrders = [];
  const seen1 = new Set();
  for (const o of sorted) {
    for (const it of o?.items || []) {
      const c = orderItemToCard(it);
      if (!c || seen1.has(c.id)) continue;
      seen1.add(c.id);
      fromOrders.push(c);
      if (fromOrders.length >= 20) break;
    }
    if (fromOrders.length >= 20) break;
  }
  const buyAgain = [];
  const seen2 = new Set();
  for (const o of sorted) {
    if (!o?.items?.length) continue;
    if (!isShippedOrDoneOrder(o)) continue;
    for (const it of o.items) {
      const c = orderItemToCard(it);
      if (!c || seen2.has(c.id)) continue;
      seen2.add(c.id);
      buyAgain.push(c);
      if (buyAgain.length >= 20) break;
    }
    if (buyAgain.length >= 20) break;
  }
  if (buyAgain.length === 0) {
    for (const c of fromOrders) {
      buyAgain.push(c);
      if (buyAgain.length >= 12) break;
    }
  }
  return { fromOrders, buyAgain };
}

async function fetchJsonProducts(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.products || []).map(productToCard).filter(Boolean);
  } catch {
    return [];
  }
}

/* ─── Mini product (compact card) ─── */
function MiniProductCard({ item, onNavigate }) {
  if (!item?.handle) return null;
  return (
    <Link
      href={`/produkt/${item.handle}`}
      onClick={onNavigate}
      className={cn(
        "group flex-shrink-0 w-[104px] sm:w-[118px] rounded-xl border border-gray-100 bg-white p-1.5",
        "shadow-sm transition-[transform,box-shadow] duration-200",
        "hover:shadow-md hover:border-gray-200 active:scale-[0.98]",
        "no-underline",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-50">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="h-full w-full object-contain p-0.5" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-300">—</div>
        )}
      </div>
      <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-[11px] font-medium leading-tight text-gray-800 sm:text-xs">
        {item.title}
      </p>
    </Link>
  );
}

/* ─── One horizontal product strip ─── */
function ProductStrip({ title, items, moreHref, moreLabel, loading, emptyLabel, onNavigate }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-2 pl-0.5 pr-1">
        <h3 className="min-w-0 text-[13px] font-bold tracking-tight text-gray-900 sm:text-sm">{title}</h3>
        {moreHref && items.length > 0 && (
          <Link
            href={moreHref}
            onClick={onNavigate}
            className="shrink-0 text-[12px] font-semibold text-orange-600 no-underline hover:underline"
          >
            {moreLabel}
          </Link>
        )}
      </div>
      <div
        className={cn(
          "flex min-h-[118px] gap-2.5 overflow-x-auto pb-1 pt-0.5 pl-0.5",
          "scroll-smooth [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5",
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
        data-account-strip
      >
        {loading && (
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[120px] w-[104px] flex-shrink-0 animate-pulse rounded-xl bg-gray-100 sm:w-[118px]"
              />
            ))}
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="px-1 py-4 text-[12px] text-gray-400">{emptyLabel}</p>
        )}
        {!loading &&
          items.map((p) => <MiniProductCard key={`${p.id}-${p.handle}`} item={p} onNavigate={onNavigate} />)}
      </div>
    </div>
  );
}

/* ─── Pills (account nav) ─── */
function NavPill({ href, icon, children, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5",
        "text-[12.5px] font-semibold text-gray-800 no-underline",
        "transition-colors duration-150 hover:border-orange-200 hover:bg-white hover:text-gray-900",
        "active:scale-[0.98] sm:py-2 sm:text-[13px]",
        "[&>svg]:text-gray-500",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

function NavPillButton({ onClick, icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-red-100 bg-red-50/80 px-3 py-1.5",
        "text-[12.5px] font-semibold text-red-600",
        "transition-colors duration-150 hover:bg-red-100/80 active:scale-[0.98] sm:py-2 sm:text-[13px]",
        "[&>svg]:text-red-400",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export default function UserDropdown({ isAuthenticated, user, onLogout, onOpen, layoutAnchorRef }) {
  const t = useTranslations("accountPanel");
  const tCommon = useTranslations("common");
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [topPx, setTopPx] = useState(0);
  const triggerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [fromOrders, setFromOrders] = useState([]);
  const [buyAgain, setBuyAgain] = useState([]);
  const [continueList, setContinueList] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [trending, setTrending] = useState([]);

  const close = useCallback(() => setOpen(false), []);

  const updatePosition = useCallback(() => {
    const el = layoutAnchorRef?.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setTopPx(rect.bottom);
    } else {
      setTopPx(72);
    }
  }, [layoutAnchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (isAuthenticated) {
          let ord = [];
          let a = [];
          let b = [];
          try {
            const token = getToken("customer");
            const client = getMedusaClient();
            const res = await Promise.all([
              client.request("/store/orders/me", { headers: { Authorization: `Bearer ${token}` } }),
              fetchJsonProducts("/api/store-products?limit=12&offset=0"),
              fetchJsonProducts("/api/store-products?limit=12&offset=14"),
            ]);
            const ordersRes = res[0];
            a = res[1];
            b = res[2];
            ord = ordersRes?.__error ? [] : (ordersRes?.orders || []);
          } catch {
            [a, b] = await Promise.all([
              fetchJsonProducts("/api/store-products?limit=12&offset=0"),
              fetchJsonProducts("/api/store-products?limit=12&offset=14"),
            ]);
          }
          if (cancelled) return;
          const { fromOrders: o1, buyAgain: o2 } = buildOrderProductLists(ord);
          setFromOrders(o1);
          setBuyAgain(o2);
          setContinueList(a.length ? a : b);
          setDiscover([]);
          setTrending([]);
        } else {
          const [a, b] = await Promise.all([
            fetchJsonProducts("/api/store-products?limit=12&offset=0"),
            fetchJsonProducts("/api/store-products?limit=12&offset=12"),
          ]);
          if (cancelled) return;
          setFromOrders([]);
          setBuyAgain([]);
          setContinueList([]);
          setDiscover(a);
          setTrending(b);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isAuthenticated]);

  const handleOpen = (next) => {
    setOpen(next);
    if (next && onOpen) onOpen();
  };

  const helloName = (() => {
    if (!user) return "";
    const first = user.firstName || user.first_name;
    const last = user.lastName || user.last_name;
    if (first || last) return [first, last].filter(Boolean).join(" ");
    if (user.email) return String(user.email).split("@")[0];
    return "";
  })();

  const panelContent = open && (
    <>
      <button
        type="button"
        aria-hidden
        className="fixed z-[2147483646] cursor-default border-0 bg-black/20"
        style={{ top: topPx, left: 0, right: 0, bottom: 0 }}
        onClick={close}
        tabIndex={-1}
      />
      <div
        id={panelId}
        role="region"
        aria-label={isAuthenticated ? t("triggerTitleAuth") : t("triggerTitleGuest")}
        className={cn(
          "fixed left-0 right-0 z-[2147483647] max-h-[min(78dvh,560px)] overflow-y-auto overflow-x-hidden",
          "border-b border-gray-200/90 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]",
          "motion-reduce:transition-none",
        )}
        style={{
          top: topPx,
          overscrollBehaviorY: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-5 sm:py-4">
          {isAuthenticated ? (
            <>
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-[1.05rem] font-bold leading-tight text-gray-900 sm:text-lg">
                  {helloName ? t("hello", { name: helloName }) : t("helloNoName")}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
                  aria-label={t("close")}
                >
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>

              <div
                className={cn(
                  "mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]",
                )}
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <NavPill href="/account" onClick={close} icon={ICONS.overview}>
                  {t("navOverview")}
                </NavPill>
                <NavPill href="/orders" onClick={close} icon={ICONS.orders}>
                  {t("navOrders")}
                </NavPill>
                <NavPill href="/merkzettel" onClick={close} icon={ICONS.wishlist}>
                  {t("navWishlist")}
                </NavPill>
                <NavPill href="/addresses" onClick={close} icon={ICONS.addresses}>
                  {t("navAddresses")}
                </NavPill>
                <NavPill href="/payment-methods" onClick={close} icon={ICONS.payment}>
                  {t("navPayment")}
                </NavPill>
                <NavPill href="/nachrichten" onClick={close} icon={ICONS.messages}>
                  {t("navMessages")}
                </NavPill>
                <NavPill href="/reviews" onClick={close} icon={ICONS.reviews}>
                  {t("navReviews")}
                </NavPill>
                <NavPill href="/bonus" onClick={close} icon={ICONS.bonus}>
                  {t("navBonus")}
                </NavPill>
                <NavPillButton
                  onClick={() => {
                    onLogout();
                    close();
                  }}
                  icon={ICONS.logout}
                >
                  {tCommon("logout")}
                </NavPillButton>
              </div>

              <div className="space-y-5">
                <ProductStrip
                  title={t("sectionOrderItems")}
                  items={fromOrders}
                  moreHref="/orders"
                  moreLabel={t("seeAll")}
                  loading={loading}
                  emptyLabel={t("emptyProducts")}
                  onNavigate={close}
                />
                <ProductStrip
                  title={t("sectionBuyAgain")}
                  items={buyAgain}
                  moreHref="/orders"
                  moreLabel={t("seeAll")}
                  loading={loading}
                  emptyLabel={t("emptyProducts")}
                  onNavigate={close}
                />
                <ProductStrip
                  title={t("sectionContinue")}
                  items={continueList}
                  moreHref="/"
                  moreLabel={t("seeAll")}
                  loading={loading}
                  emptyLabel={t("emptyProducts")}
                  onNavigate={close}
                />
              </div>
            </>
          ) : (
            <>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[1.05rem] font-bold text-gray-900 sm:text-lg">{t("guestTitle")}</p>
                  <p className="mt-0.5 text-[12.5px] text-gray-500 sm:text-sm">{t("guestSubtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
                  aria-label={t("close")}
                >
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>

              <div
                className="mb-4 flex gap-2 overflow-x-auto pb-1"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <NavPill href="/login" onClick={close} icon={ICONS.overview}>
                  {tCommon("login")}
                </NavPill>
                <NavPill href="/register" onClick={close} icon={ICONS.orders}>
                  {tCommon("register")}
                </NavPill>
                <NavPill href="/orders" onClick={close} icon={ICONS.orders}>
                  {t("sectionOrderItems")}
                </NavPill>
              </div>

              <div className="space-y-5">
                <ProductStrip
                  title={t("sectionDiscover")}
                  items={discover}
                  moreHref="/"
                  moreLabel={t("seeAll")}
                  loading={loading}
                  emptyLabel={t("emptyProducts")}
                  onNavigate={close}
                />
                <ProductStrip
                  title={t("sectionTrending")}
                  items={trending}
                  moreHref="/"
                  moreLabel={t("seeAll")}
                  loading={loading}
                  emptyLabel={t("emptyProducts")}
                  onNavigate={close}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={isAuthenticated ? t("triggerTitleAuth") : t("triggerTitleGuest")}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={isAuthenticated ? t("triggerTitleAuth") : t("triggerTitleGuest")}
        style={{
          position: "relative",
          width: 46,
          height: 46,
          border: "none",
          background: "transparent",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          transition: "background 0.2s ease",
          outline: "none",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
        onClick={() => handleOpen(!open)}
      >
        <PersonIcon />
        {isAuthenticated && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 5,
              right: 5,
              width: 15,
              height: 15,
              borderRadius: "50%",
              background: "linear-gradient(160deg,#4ade80 0%,#22c55e 100%)",
              border: "2px solid #1b7a72",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              pointerEvents: "none",
            }}
          >
            <svg viewBox="0 0 12 12" fill="none" width="9" height="9">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </button>
      {typeof document !== "undefined" && open ? createPortal(panelContent, document.body) : null}
    </>
  );
}
