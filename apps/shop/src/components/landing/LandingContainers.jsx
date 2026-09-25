"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import { getMedusaClient, resolveMedusaBaseUrl } from "@/lib/medusa-client";
import { useLandingChrome } from "@/context/LandingChromeContext";
import Carousel from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";
import { toSalesScore } from "@/lib/bestseller";
import { isDiscountedProduct, getProductBasePriceCents, isWithinNewWindow, loadNewProductWindowDays, loadCatalogBadgeRules } from "@/lib/catalog-listing";
import { formatPriceCents, getLocalizedCategory } from "@/lib/format";
import { shallowCategoriesQuery, storeCategoriesQuery } from "@/lib/store-categories-url";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { cachedJsonFetch } from "@/lib/browser-fetch-cache";
import { bestsellerPreloadKey } from "@/lib/landing-page-fetch";
import { resolveCatalogLandingContainers } from "@/lib/catalog-landing-layout";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { useIsNarrow, useIsTablet } from "@/hooks/useIsNarrow";
import { useLocale, useTranslations } from "next-intl";
import CatalogHubFilterShell from "@/components/catalog/CatalogHubFilterShell";
import { tokens } from "@/design-system/tokens";
import styled from "styled-components";

// "See all/more" link under a product carousel — matches the brand accent used across the shop
// header/CTAs (var(--shop-primary), so a superuser's custom accent color still applies) instead
// of a generic unbranded blue, and skips the permanent underline (hover-only) so it reads as a
// designed link, not default browser-link styling.
const SeeAllLink = styled(Link)`
  font-size: 13px;
  font-weight: 600;
  color: var(--shop-primary, ${tokens.primary.DEFAULT});
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

// Code-split: these are each their own module already (no internal refactor needed) and are
// niche/rarely-rendered container types (support pages, become-seller landing, brands directory)
// — most product/category page visits never mount any of them, so there's no reason to ship
// their JS in the same bundle every visitor downloads. This was part of the PageSpeed TBT/unused-
// JS finding (large landing chunk, ~70KB flagged unused on a typical page load).
const SupportLanding = dynamic(() => import("@/components/support/SupportLanding"), { ssr: false });
const BecomeSellerLanding = dynamic(() => import("@/components/landing/BecomeSellerLanding"), { ssr: false });
const BrandsDirectoryBlock = dynamic(() => import("@/components/landing/BrandsDirectoryBlock"), { ssr: false });

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

/** Read a translatable text field — falls back to root field (DE default) */
function lt(obj, field, locale) {
  if (!locale || locale === "de") return obj?.[field] ?? "";
  return obj?._i18n?.[locale]?.[field] ?? obj?.[field] ?? "";
}

/** Bild/URL-Feld für die aktuelle Locale (leer = nicht anzeigen / Slot ausblenden wo sinnvoll) */
function localizedAsset(obj, field, locale) {
  return String(lt(obj, field, locale) || "").trim();
}

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    // Strip the host on absolute /uploads/... URLs (including stale/old backend domains from
    // before any rename/migration) so the shop's own /uploads rewrite proxy serves them through
    // the CURRENT backend + our domain's caching, instead of a cross-origin hotlink that can 404
    // if the old host is ever retired. Anything else (external/seller-hotlinked images) passes
    // through unchanged — mirrors apps/shop/src/lib/image-url.js's resolveImageUrl().
    try {
      const pathname = new URL(url).pathname;
      if (pathname.startsWith("/uploads/")) return pathname;
    } catch (_) {}
    return url;
  }
  if (url.startsWith("/")) return url;
  return `${BACKEND_URL}/uploads/${url}`;
}

/** Sellercentral hero slides store overlay as 0–100; older rows may use 0–1. */
function slideOverlayOpacity(slide) {
  const raw = slide?.overlay ?? slide?.overlay_opacity;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n > 1 ? n / 100 : n);
}

function parsePaddingParts(val) {
  const parts = (val || "0px").trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
}

// A bare number (no CSS unit) is invalid for padding and gets silently dropped by the browser —
// same class of bug as the outer-margin one above. Normalize defensively here too.
function cssLengthOrSelf(v) {
  return v != null && /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? `${v}px` : v;
}

// Inner padding from container.padding only. External gaps between containers use margin on the wrapper.
function getContainerPadding(container, defaultPad) {
  const [t, r, b, l] = parsePaddingParts(container.padding || defaultPad || "0px");
  return { paddingTop: cssLengthOrSelf(t), paddingRight: cssLengthOrSelf(r), paddingBottom: cssLengthOrSelf(b), paddingLeft: cssLengthOrSelf(l) };
}

/** Innere Zeile: volle Breite innerhalb des Container-Paddings oder zentriert mit max-width (pro Block typischer Fallback in px). */
function normalizeContentMaxWidth(val, fallbackPx) {
  const n = Number(fallbackPx);
  const fb = `${Number.isFinite(n) && n > 0 ? n : 1440}px`;
  if (val == null || val === "") return fb;
  const s = String(val).trim();
  if (/^\d+$/.test(s)) return `${s}px`;
  if (/^[\d.]+(px|%|rem|em|ch|vw)$/i.test(s)) return s;
  return fb;
}

/** Dünne Überschrift direkt unter einem Bild / einer Karten-Fläche (Landing) */
function LandingItemHeadingStyle() {
  return {
    fontSize: 12,
    fontWeight: 400,
    color: "#64748b",
    lineHeight: 1.35,
    marginTop: 4,
    letterSpacing: "0.02em",
  };
}

function LandingItemHeading({ children }) {
  if (children == null || !String(children).trim()) return null;
  return <div style={LandingItemHeadingStyle()}>{children}</div>;
}

function LandingItemSubtext({ html, marginTop: mt }) {
  if (!html || !String(html).trim()) return null;
  return (
    <div
      style={{ fontSize: 14, color: "#374151", marginTop: mt != null ? mt : 8, lineHeight: 1.6 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function parseLandingProductCaptions(raw) {
  if (raw == null || raw === "") return [];
  return String(raw).split("\n").map((s) => s.trimEnd());
}

function catalogSectionStyle(container, defaultPad = "48px 24px") {
  return {
    ...getContainerPadding(container, defaultPad),
    background: container.bg_color || "transparent",
  };
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(!!mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return reduce;
}

function getContentInnerStyle(container, fallbackMaxPx) {
  if (container.content_layout === "full") {
    return {
      width: "100%",
      maxWidth: "none",
      boxSizing: "border-box",
      minWidth: 0,
      marginLeft: 0,
      marginRight: 0,
    };
  }
  const cap = normalizeContentMaxWidth(container.content_max_width, fallbackMaxPx);
  return {
    width: "100%",
    maxWidth: cap,
    boxSizing: "border-box",
    minWidth: 0,
    marginLeft: "auto",
    marginRight: "auto",
  };
}

/** @param {unknown[]} arr @param {number} pageSize */
function chunkArrayForMobilePages(arr, pageSize) {
  const s = Math.max(1, pageSize);
  const out = [];
  for (let i = 0; i < arr.length; i += s) {
    out.push(arr.slice(i, i + s));
  }
  return out;
}

/**
 * mobile_layout: "row" = eine Zeile wischen, "grid" = Raster (Zeilen×Spalten) pro „Seite“ wischen
 * @param {{ mobile_layout?: string, mobile_grid_rows?: unknown, mobile_grid_cols?: unknown }} container
 */
function resolveMobilePagedGrid(container) {
  const isGrid = container?.mobile_layout === "grid";
  const rows = Math.max(1, Math.min(4, Math.round(Number(container?.mobile_grid_rows)) || 2));
  const cols = Math.max(1, Math.min(4, Math.round(Number(container?.mobile_grid_cols)) || 2));
  return { isGrid, rows, cols, pageSize: rows * cols };
}

/**
 * Mobil (≤1023px): horizontale Snap-Seiten, jede Seite = CSS-Grid mit rows×cols
 */
function MobilePagedGridScroll({ title, gap, rows, cols, items, itemKey, renderItem, ariaLabel }) {
  const tLanding = useTranslations("landing");
  const pageSize = Math.max(1, rows * cols);
  const pages = useMemo(
    () => chunkArrayForMobilePages(items, pageSize),
    [items, pageSize]
  );

  const titleStr = title != null ? String(title).trim() : "";
  return (
    <div>
      {titleStr ? (
        <h2
          style={{
            fontSize: "clamp(1.125rem, 2vw, 1.375rem)",
            fontWeight: 600,
            color: "#111827",
            margin: "0 0 16px 0",
            lineHeight: 1.3,
          }}
        >
          {titleStr}
        </h2>
      ) : null}
      <div
        role="region"
        aria-label={ariaLabel || titleStr || tLanding("carousel")}
        style={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          width: "100%",
          paddingBottom: 4,
        }}
      >
        {pages.map((page, pi) => (
          <div
            key={pi}
            style={{
              flex: "0 0 100%",
              minWidth: "100%",
              width: "100%",
              maxWidth: "100%",
              scrollSnapAlign: "start",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridAutoRows: "minmax(0, auto)",
                gap,
                alignItems: "start",
                width: "100%",
              }}
            >
              {page.map((item, idx) => {
                const globalIdx = pi * pageSize + idx;
                return (
                  <div key={itemKey(item, globalIdx)} style={{ minWidth: 0, width: "100%" }}>
                    {renderItem(item, globalIdx)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function collectionHref(handle) {
  const value = String(handle || "").trim();
  return value ? `/${value}` : "#";
}

/** Kollektionen-Karussell: Main image (metadata.image_url in Seller), not the collection page banner. */
function collectionCarouselCardImageFromLive(live) {
  if (!live) return "";
  const meta = live.metadata && typeof live.metadata === "object" ? live.metadata : {};
  const main = live.image_url || live.image || live.thumbnail || meta.image_url || meta.image || "";
  if (main) return resolveUrl(main);
  return "";
}

const COLLECTIONS_CAROUSEL_ASPECT_RATIOS = new Set([
  "4/5", "3/4", "2/3", "1/1", "4/3", "3/2", "16/9", "21/9",
]);

/** Normalizes CMS value (e.g. "4:5" or legacy) to a safe CSS aspect-ratio. */
function normalizeCollectionsCarouselAspectRatio(raw) {
  const s = String(raw || "4/5").trim().replace(/\s+/g, "").replace(/:/g, "/");
  return COLLECTIONS_CAROUSEL_ASPECT_RATIOS.has(s) ? s : "4/5";
}

function blogBodyToPlainSnippet(html, maxLen = 400) {
  const t = String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function blogCardPreviewText(post) {
  const ex = (post.excerpt || "").trim();
  if (ex) return ex;
  return blogBodyToPlainSnippet(post.body, 400);
}

function getPositionStyle(pos) {
  const map = {
    "top-left":     { alignItems: "flex-start", justifyContent: "flex-start", textAlign: "left" },
    "top-center":   { alignItems: "flex-start", justifyContent: "center",     textAlign: "center" },
    "top-right":    { alignItems: "flex-start", justifyContent: "flex-end",   textAlign: "right" },
    "center-left":  { alignItems: "center",     justifyContent: "flex-start", textAlign: "left" },
    "center":       { alignItems: "center",     justifyContent: "center",     textAlign: "center" },
    "center-right": { alignItems: "center",     justifyContent: "flex-end",   textAlign: "right" },
    "bottom-left":  { alignItems: "flex-end",   justifyContent: "flex-start", textAlign: "left" },
    "bottom-center":{ alignItems: "flex-end",   justifyContent: "center",     textAlign: "center" },
    "bottom-right": { alignItems: "flex-end",   justifyContent: "flex-end",   textAlign: "right" },
  };
  return map[pos] || map["center"];
}

const HERO_FALLBACK_BG = "linear-gradient(135deg, #163a38 0%, #1B8880 52%, #0f2f2d 100%)";

function heroSlideHasContent(s, locale) {
  if (!s) return false;
  const hasMedia =
    !!localizedAsset(s, "image", locale) ||
    !!localizedAsset(s, "image_url", locale) ||
    !!(s.video_url && String(s.video_url).trim());
  const hasCopy =
    !!String(lt(s, "title", locale) || "").trim() ||
    !!String(lt(s, "subtitle", locale) || "").trim() ||
    !!String(lt(s, "btn_text", locale) || "").trim();
  return hasMedia || hasCopy;
}

function HeroSlideBackdrop({ s, locale, priority = false }) {
  const videoSrc = s.video_url ? resolveUrl(s.video_url) : "";
  const img = resolveUrl(localizedAsset(s, "image", locale) || localizedAsset(s, "image_url", locale));
  const overlay = slideOverlayOpacity(s);
  return (
    <>
      {videoSrc ? (
        <video src={videoSrc} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} autoPlay muted loop playsInline />
      ) : img ? (
        <Image
          src={img}
          alt={lt(s, "title", locale) || ""}
          fill
          sizes="100vw"
          priority={priority}
          style={{ objectFit: "cover", userSelect: "none" }}
          draggable="false"
        />
      ) : (
        <div aria-hidden style={{ position: "absolute", inset: 0, background: s.bg_color || HERO_FALLBACK_BG }} />
      )}
      {overlay > 0 && (
        <div aria-hidden style={{ position: "absolute", inset: 0, background: `rgba(13, 31, 26, ${overlay})`, pointerEvents: "none" }} />
      )}
    </>
  );
}

// Resolve alignSelf for a button based on justifyContent
function btnAlignSelf(justifyContent) {
  if (justifyContent === "flex-start") return "flex-start";
  if (justifyContent === "flex-end") return "flex-end";
  return "center";
}

// ── Hero Banner Slider ────────────────────────────────────────────────────────
function HeroBanner({ container, locale = "de", headingLevel = 2 }) {
  const tCommon = useTranslations("common");
  const tLanding = useTranslations("landing");
  const reduceMotion = usePrefersReducedMotion();
  const isMobile = useIsNarrow(767);
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const scrollRef = useRef(null);
  const userScrolling = useRef(false);

  const slidesRaw = Array.isArray(container.slides) ? container.slides : [];
  let slides = slidesRaw.filter((s) => heroSlideHasContent(s, locale));
  // Flat hero fields (image_url + title on the container) — used by become-seller seed and older rows.
  if (!slides.length) {
    const flatImage = lt(container, "image", locale) || lt(container, "image_url", locale) || container.image_url || container.image || "";
    if (flatImage || lt(container, "title", locale) || lt(container, "subtitle", locale)) {
      slides = [{
        image: flatImage,
        title: container.title || "",
        subtitle: container.subtitle || "",
        btn_text: container.btn_text || "",
        btn_url: container.btn_url || "",
        overlay: 0,
        text_color: container.text_color || "#ffffff",
        text_position: container.text_position || "center",
        _i18n: container._i18n || undefined,
      }];
    }
  }
  const height = container.height || container.min_height || "500px";
  const mobileHeight = container.mobile_height || (container.min_height && String(container.min_height).includes("vh") ? "70vh" : "200px");
  const mobilePadding = container.mobile_padding || "0px";
  const mobileRadius = container.mobile_radius ? `${container.mobile_radius}px` : "0px";

  // ── Auto-advance ──────────────────────────────────────────────────────────
  const scheduleNext = useCallback(() => {
    clearTimeout(timerRef.current);
    if (reduceMotion) return;
    if (container.autoplay !== false && slides.length > 1) {
      timerRef.current = setTimeout(() => setCurrent((c) => (c + 1) % slides.length), container.delay || 4000);
    }
  }, [slides.length, container.autoplay, container.delay, reduceMotion]);

  useEffect(() => {
    scheduleNext();
    return () => clearTimeout(timerRef.current);
  }, [current, scheduleNext]);

  // ── Sync scroll to current (programmatic navigation) ─────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isMobile || userScrolling.current) return;
    el.scrollTo({ left: current * el.offsetWidth, behavior: reduceMotion ? "auto" : "smooth" });
  }, [current, isMobile, reduceMotion]);

  // ── Update current index when user swipes ─────────────────────────────────
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.offsetWidth);
    if (idx !== current) {
      userScrolling.current = true;
      clearTimeout(timerRef.current);
      setCurrent(idx);
      setTimeout(() => { userScrolling.current = false; }, 500);
    }
  }, [current]);

  const goTo = useCallback((idx) => {
    const el = scrollRef.current;
    userScrolling.current = false;
    setCurrent(idx);
    if (el && isMobile) el.scrollTo({ left: idx * el.offsetWidth, behavior: reduceMotion ? "auto" : "smooth" });
    scheduleNext();
  }, [scheduleNext, isMobile, reduceMotion]);

  if (slides.length === 0) return null;

  // ── Shared slide text overlay ─────────────────────────────────────────────
  function Overlay({ s, mobile }) {
    const title = lt(s, "title", locale);
    const subtitle = lt(s, "subtitle", locale);
    const btnText = lt(s, "btn_text", locale);
    if (!title && !subtitle && !btnText) return null;
    const ps = getPositionStyle(s.text_position || "center");
    const TitleTag = headingLevel === 1 ? "h1" : "h2";
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: mobile ? "14px" : (s.content_padding || "32px 48px"), pointerEvents: "none", ...ps }}>
        {title && <TitleTag style={{ fontSize: mobile ? "clamp(14px,5vw,26px)" : (s.title_size || "clamp(24px,4vw,56px)"), fontWeight: 900, color: s.title_color || s.text_color || "#fff", margin: 0, lineHeight: 1.15, marginBottom: subtitle ? 6 : (btnText ? 10 : 0) }}>{title}</TitleTag>}
        {subtitle && <p style={{ fontSize: mobile ? "clamp(11px,3vw,15px)" : (s.subtitle_size || "clamp(14px,2vw,22px)"), color: s.subtitle_color || s.text_color || "#fff", margin: btnText ? "0 0 10px" : 0, maxWidth: 600 }}>{subtitle}</p>}
        {btnText && (
          <a
            href={s.btn_url || "#"}
            style={{
              pointerEvents: "auto",
              display: "inline-block",
              padding: mobile ? "7px 16px" : (s.btn_padding || "12px 28px"),
              background: s.btn_bg || "#ff971c",
              color: s.btn_color || "#fff",
              border: s.btn_border || "2px solid #000",
              borderRadius: s.btn_radius || 8,
              fontWeight: 800,
              fontSize: mobile ? 12 : 15,
              textDecoration: "none",
              boxShadow: s.btn_variant === "flat" ? "none" : "0 3px 0 2px #000",
              alignSelf: btnAlignSelf(ps.justifyContent),
            }}
            onMouseEnter={(e) => {
              if (s.btn_hover_bg) e.currentTarget.style.background = s.btn_hover_bg;
              if (s.btn_hover_color) e.currentTarget.style.color = s.btn_hover_color;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = s.btn_bg || "#ff971c";
              e.currentTarget.style.color = s.btn_color || "#fff";
            }}
          >
            {btnText}
          </a>
        )}
      </div>
    );
  }

  // ── Dots ──────────────────────────────────────────────────────────────────
  function Dots({ mobile }) {
    if (slides.length <= 1) return null;
    return (
      <div style={{ position: "absolute", bottom: mobile ? 8 : 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: mobile ? 5 : 8, zIndex: 5, pointerEvents: "auto" }}>
        {slides.map((_, i) => (
          <button key={i} type="button" onClick={() => goTo(i)} aria-label={tLanding("slide", { n: i + 1 })} aria-current={i === current ? "true" : undefined}
            style={{ width: i === current ? (mobile ? 18 : 24) : (mobile ? 6 : 10), height: mobile ? 6 : 10, borderRadius: mobile ? 3 : 5, border: "none", cursor: "pointer", background: i === current ? "#ff971c" : "rgba(255,255,255,0.65)", transition: "all .28s", padding: 0 }} />
        ))}
      </div>
    );
  }

  // ── MOBILE: native scroll-snap carousel ───────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ padding: mobilePadding }}>
        <div style={{ position: "relative", borderRadius: mobileRadius, overflow: "hidden" }}>
          {/* Scroll track — native scroll-snap handles all swipe physics */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            style={{
              display: "flex",
              overflowX: slides.length > 1 ? "auto" : "hidden",
              scrollSnapType: slides.length > 1 ? "x mandatory" : "none",
              scrollBehavior: "auto",          /* smooth done via scrollTo */
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              height: mobileHeight,
            }}
          >
            {slides.map((s, i) => {
              const inner = (
                <>
                  <HeroSlideBackdrop s={s} locale={locale} priority={i === 0} />
                  <Overlay s={s} mobile />
                </>
              );
              const itemStyle = {
                minWidth: "100%", flexShrink: 0, scrollSnapAlign: "start",
                position: "relative", overflow: "hidden",
              };
              return s.btn_url
                ? <a key={i} href={s.btn_url} style={{ ...itemStyle, display: "block" }}>{inner}</a>
                : <div key={i} style={itemStyle}>{inner}</div>;
            })}
          </div>
          <style>{`.hero-mobile-scroll::-webkit-scrollbar{display:none}`}</style>
          <Dots mobile />
        </div>
      </div>
    );
  }

  // ── DESKTOP: original opacity cross-fade slider ────────────────────────────
  const slide = slides[current];
  const posStyle = getPositionStyle(slide.text_position || "center");
  return (
    <div style={getContainerPadding(container, "0px 0px 0px 0px")}>
      <div style={getContentInnerStyle(container, 1600)}>
        <div style={{ position: "relative", width: "100%", height, overflow: "hidden" }}>
          {slides.map((s, i) => {
            const mediaEl = (
              <>
                <HeroSlideBackdrop s={s} locale={locale} priority={i === 0} />
              </>
            );
            const wrapStyle = { position: "absolute", inset: 0, opacity: i === current ? 1 : 0, transition: "opacity 0.7s ease", pointerEvents: i === current ? "auto" : "none" };
            return s.btn_url
              ? <a key={i} href={s.btn_url} style={{ ...wrapStyle, display: "block" }}>{mediaEl}</a>
              : <div key={i} style={wrapStyle}>{mediaEl}</div>;
          })}
          <Overlay s={slide} mobile={false} />
          <Dots mobile={false} />
          {slides.length > 1 && (
            <>
              <button type="button" aria-label={tCommon("previous")} onClick={() => goTo((current - 1 + slides.length) % slides.length)} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>‹</button>
              <button type="button" aria-label={tCommon("next")} onClick={() => goTo((current + 1) % slides.length)} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>›</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Text Block ────────────────────────────────────────────────────────────────
function TextBlock({ container, locale = "de" }) {
  const align = container.align || "center";
  const posStyle = getPositionStyle(container.text_position || `center-${align === "left" ? "left" : align === "right" ? "right" : "center"}`);
  const title = lt(container, "title", locale);
  const body = lt(container, "body", locale);
  const btnText = lt(container, "btn_text", locale);
  return (
    <div style={{ background: container.bg_color || "transparent", ...getContainerPadding(container, "48px 24px") }}>
      <div style={{ ...getContentInnerStyle(container, 800), textAlign: align }}>
        {title && (
          <h2 style={{ fontSize: "clamp(20px,3vw,36px)", fontWeight: 800, color: container.text_color || "#111827", margin: "0 0 16px" }}>
            {title}
          </h2>
        )}
        {body && (
          <div style={{ fontSize: 16, color: container.text_color || "#374151", lineHeight: 1.7, margin: "0 0 24px" }} dangerouslySetInnerHTML={{ __html: body }} />
        )}
        {btnText && container.btn_url && (
          <a
            href={container.btn_url}
            className="landing-cta-btn"
            style={{
              display: "inline-block", padding: container.btn_padding || "12px 28px",
              background: container.btn_bg || "#ff971c",
              color: container.btn_color || "#fff",
              border: container.btn_border || "2px solid #000",
              borderRadius: container.btn_radius || 8,
              fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 3px 0 2px #000",
            }}
          >
            {btnText}
          </a>
        )}
      </div>
      <style>{`.landing-cta-btn{transition:transform .15s ease,box-shadow .15s ease,filter .15s ease;}.landing-cta-btn:hover{transform:translateY(-1px);filter:brightness(0.96);}.landing-cta-btn:active{transform:translateY(0);filter:brightness(0.92);}`}</style>
    </div>
  );
}

/** YouTube- / Vimeo-Links in eine sichere embed-URL umwandeln */
function landingVideoEmbedFromUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https:\/\/(www\.)?youtube\.com\/embed\//i.test(raw)) {
    return raw.includes("?") ? raw : `${raw}?modestbranding=1&rel=0&playsinline=1`;
  }
  if (/player\.vimeo\.com\/video\//i.test(raw)) {
    return raw;
  }
  let s = raw;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const h = u.hostname.replace(/^www\./, "");
    if (h === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}?modestbranding=1&rel=0&playsinline=1`;
    }
    if (h === "youtube.com" || h === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}?modestbranding=1&rel=0&playsinline=1`;
      const sh = u.pathname.match(/\/embed\/([^/?]+)/);
      if (sh) return `https://www.youtube.com/embed/${sh[1]}?modestbranding=1&rel=0&playsinline=1`;
    }
    if (h === "vimeo.com") {
      const m = u.pathname.match(/(\d{6,})/);
      if (m) return `https://player.vimeo.com/video/${m[1]}`;
    }
  } catch {
    return "";
  }
  return "";
}

// ── Video (Datei-URL oder Einbettung, optional Desktop/Mobil getrennt) ──────
function VideoBlock({ container, locale = "de" }) {
  const isNarrow = useIsNarrow(1023);
  const mode = container.video_mode === "embed" ? "embed" : "file";
  const ar = String(container.aspect_ratio || "16/9").replace(/:/g, "/").replace(/\s+/g, "") || "16/9";
  const arNorm = ar === "auto" ? "16/9" : ar;

  const embedDesktop = mode === "embed" ? landingVideoEmbedFromUrl(container.embed_url) : "";
  const embedMobileRaw = mode === "embed" ? landingVideoEmbedFromUrl(container.embed_url_mobile) : "";
  const embedSrc = isNarrow && embedMobileRaw ? embedMobileRaw : embedDesktop;

  const fileDesktop = String(container.video_url || "").trim() ? resolveUrl(container.video_url) : "";
  const fileMobileRaw = String(container.video_url_mobile || "").trim() ? resolveUrl(container.video_url_mobile) : "";
  const fileSrc = isNarrow && fileMobileRaw ? fileMobileRaw : fileDesktop;

  const posterDRaw = localizedAsset(container, "poster_url", locale);
  const posterMRaw = localizedAsset(container, "poster_url_mobile", locale);
  const posterD = posterDRaw ? resolveUrl(lt(container, "poster_url", locale)) : undefined;
  const posterM = posterMRaw ? resolveUrl(lt(container, "poster_url_mobile", locale)) : undefined;
  const poster = isNarrow && posterM ? posterM : posterD;

  const hasEmbed = mode === "embed" && Boolean(embedSrc);
  const hasFile = mode === "file" && Boolean(fileSrc);
  if (!hasEmbed && !hasFile) return null;

  const tc = container.text_color || "#111827";
  const bg = container.bg_color || "transparent";
  const autoplay = container.autoplay === true;
  const muted = container.muted !== false;
  const loop = container.loop === true;
  const controls = container.controls !== false;
  const playsInline = container.playsinline !== false;
  const box = {
    position: "relative",
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #e5e7eb",
    background: "#000",
    aspectRatio: arNorm,
  };

  return (
    <div style={{ background: bg, ...getContainerPadding(container, "32px 24px") }}>
      <div style={{ ...getContentInnerStyle(container, 1000) }}>
        {lt(container, "title", locale) && (
          <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.5rem)", fontWeight: 700, color: tc, margin: "0 0 8px" }}>
            {lt(container, "title", locale)}
          </h2>
        )}
        {lt(container, "caption", locale) && (
          <p style={{ fontSize: 15, color: tc, margin: "0 0 16px", lineHeight: 1.5, opacity: 0.92 }}>
            {lt(container, "caption", locale)}
          </p>
        )}
        <div style={box}>
          {mode === "embed" ? (
            <iframe
              title={String(lt(container, "title", locale) || "Video").slice(0, 120)}
              src={embedSrc}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
            />
          ) : (
            <video
              key={fileSrc}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: ar === "auto" ? "contain" : "cover",
                display: "block",
                background: "#000",
              }}
              controls={controls}
              playsInline={playsInline}
              muted={autoplay || muted}
              autoPlay={autoplay}
              loop={loop}
              poster={poster}
            >
              <source src={fileSrc} />
            </video>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Image + Text ──────────────────────────────────────────────────────────────
function ImageText({ container, locale = "de" }) {
  const imageLeft = container.image_side !== "right" && container.image_position !== "right";
  // Editor stores `image`; some seeds/legacy rows use `image_url`.
  const imgSrc = resolveUrl(
    lt(container, "image", locale) ||
      lt(container, "image_url", locale) ||
      container.image_url ||
      container.image ||
      "",
  );
  const videoSrc = container.video_url ? resolveUrl(container.video_url) : "";
  const textAlign = container.text_align || "left";
  const title = lt(container, "title", locale);
  const body = lt(container, "body", locale);
  const btnText = lt(container, "btn_text", locale);
  return (
    <div style={{ background: container.bg_color || "transparent", ...getContainerPadding(container, "48px 24px") }}>
      <div style={{ ...getContentInnerStyle(container, 1100), display: "flex", flexDirection: imageLeft ? "row" : "row-reverse", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
        {(videoSrc || imgSrc) && (
          <div style={{ flex: "0 0 auto", width: "min(45%, 480px)" }}>
            {videoSrc ? (
              <video src={videoSrc} style={{ width: "100%", borderRadius: 12, display: "block", border: "2px solid #000", boxShadow: "0 4px 0 2px #000" }} autoPlay muted loop playsInline />
            ) : (
              // No fixed aspect-ratio config exists for this container type — width/height below
              // are only a size HINT for next/image's optimizer + initial reserved space; the
              // style override (width:100%, height:auto) still lets the real image's own aspect
              // ratio win once it loads, exactly like the old raw <img>, so editors' crops/ratios
              // aren't forced into anything. This is next/image's documented pattern for "known
              // container width, unknown source aspect ratio."
              <Image
                src={imgSrc}
                alt={title || ""}
                width={800}
                height={600}
                sizes="(max-width: 768px) 45vw, 480px"
                loading="lazy"
                style={{ width: "100%", height: "auto", borderRadius: 12, display: "block", border: "2px solid #000", boxShadow: "0 4px 0 2px #000" }}
              />
            )}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240, textAlign }}>
          {title && (
            <h2 style={{ fontSize: "clamp(20px,2.5vw,32px)", fontWeight: 800, color: container.text_color || "#111827", margin: "0 0 12px" }}>
              {title}
            </h2>
          )}
          {body && (
            <div style={{ fontSize: 16, color: container.text_color || "#374151", lineHeight: 1.7, margin: "0 0 20px" }} dangerouslySetInnerHTML={{ __html: body }} />
          )}
          {btnText && container.btn_url && (
            <a
              href={container.btn_url}
              style={{
                display: "inline-block", padding: container.btn_padding || "10px 24px",
                background: container.btn_bg || "#ff971c",
                color: container.btn_color || "#fff",
                border: container.btn_border || "2px solid #000",
                borderRadius: container.btn_radius || 8,
                fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 3px 0 2px #000",
              }}
            >
              {btnText}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** "1,2,2" oder "1 2" → [1,2,2], jede Zahl = Spalten in dieser Zeile (wiederholend) */
function parseMosaicLayoutPattern(input, fallback = [1, 2]) {
  const s = String(input ?? "").trim();
  if (!s) return fallback;
  const parts = s.split(/[,;\s]+/).map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n) && n >= 1);
  if (!parts.length) return fallback;
  return parts.map((n) => Math.min(8, Math.max(1, n)));
}

/** Items nacheinander in Zeilen füllen, Zeilengröße folgt wechselndem Muster (z. B. 1 dann 2 dann 1…) */
function buildMosaicRows(items, pattern) {
  if (!Array.isArray(items) || !items.length) return [];
  const p = pattern.length ? pattern : [1];
  const rows = [];
  let idx = 0;
  let pi = 0;
  while (idx < items.length) {
    const want = p[pi % p.length];
    const n = Math.max(1, Math.min(8, want));
    const rowItems = items.slice(idx, idx + n);
    if (rowItems.length === 0) break;
    rows.push(rowItems);
    idx += rowItems.length;
    pi += 1;
  }
  return rows;
}

/** 0-basierter Index in der flachen Raster-Reihenfolge (Mosaik) */
function mosaicGridCellIndex(rows, rowIdx, colIdx) {
  let o = 0;
  for (let r = 0; r < rowIdx; r++) o += rows[r].length;
  return o + colIdx;
}

// ── Content-Mosaic: Bilder ODER Kollektionsprodukte ODER Kollektionen, Raster frei wählbar ──
function ContentMosaic({ container, preloadedProducts, locale = "de" }) {
  const tNav = useTranslations("nav");
  const isNarrow = useIsNarrow(1023);
  const source = String(container.source || "images");
  // Products/collections are equal-size cards, not a curated collage — render them as a plain,
  // evenly-sized grid (same as the collection carousel) instead of the images-only row pattern
  // below, which was making the first row (often just 1 item) span full-width huge and the rest
  // stack oversized on top of each other.
  const isGridSource = source === "collection" || source === "collections";
  const gridColsDesktop = Math.max(1, Math.min(6, container.items_per_row != null ? Number(container.items_per_row) || 4 : 4));
  const gridColsMobile = Math.max(1, Math.min(4, container.items_per_row_mobile != null ? Number(container.items_per_row_mobile) || 2 : 2));
  const gridCols = isNarrow ? gridColsMobile : gridColsDesktop;
  const baseGap = container.gap != null ? Number(container.gap) : 16;
  const gapMobile = container.gap_mobile != null ? Number(container.gap_mobile) : null;
  const gap = isNarrow && gapMobile != null && !Number.isNaN(gapMobile) ? gapMobile : (Number.isNaN(baseGap) ? 16 : baseGap);
  const patD = parseMosaicLayoutPattern(container.layout_pattern_desktop, [1, 2]);
  const patM = parseMosaicLayoutPattern(container.layout_pattern_mobile, [1]);
  const pattern = isNarrow ? patM : patD;
  // Free grid ("Amazon-style" mosaic, TASKS: content_mosaic layout freedom): each image declares
  // its own col_span/row_span instead of every row being an equal-width strip — CSS Grid's own
  // auto-flow: dense packing does the actual layout work, so a tall hero image next to two
  // stacked smaller ones (or any other asymmetric arrangement) needs zero custom placement logic.
  const isFreeGrid = source === "images" && container.mosaic_mode === "grid";
  const freeGridCols = Math.max(1, Math.min(6, Number(isNarrow ? (container.grid_cols_mobile ?? 2) : (container.grid_cols_desktop ?? 3)) || (isNarrow ? 2 : 3)));
  const freeGridRowHeight = Math.max(40, Number(isNarrow ? (container.grid_row_height_mobile ?? 120) : (container.grid_row_height_desktop ?? 160)) || (isNarrow ? 120 : 160));
  const ratio = normalizeCollectionsCarouselAspectRatio(container.card_aspect_ratio);
  const imgObjectFit = container.card_image_object_fit === "contain" ? "contain" : "cover";
  const bg = container.bg_color || "transparent";

  const [liveCollections, setLiveCollections] = useState(null);
  const snapshots = Array.isArray(container.collections) ? container.collections.filter(Boolean) : [];
  const [products, setProducts] = useState(
    source === "collection" ? preloadedProducts : undefined
  );

  useEffect(() => {
    if (source !== "collection") return;
    if (Array.isArray(preloadedProducts)) {
      setProducts(preloadedProducts);
      return;
    }
    if (!container.collection_id && !container.collection_handle) {
      setProducts([]);
      return;
    }
    const param = container.collection_id
      ? `collection_id=${encodeURIComponent(container.collection_id)}`
      : `collection_handle=${encodeURIComponent(container.collection_handle)}`;
    cachedJsonFetch(`/api/store-products?${param}&limit=100`, { ttlMs: 15000 })
      .then((d) => setProducts(Array.isArray(d?.products) ? d.products : []))
      .catch(() => setProducts([]));
  }, [source, container.collection_id, container.collection_handle, preloadedProducts]);

  useEffect(() => {
    if (source !== "collections" || !snapshots.length) return;
    fetch("/api/store-collections")
      .then((r) => r.json())
      .then((data) => {
        const all = Array.isArray(data?.collections) ? data.collections : [];
        if (!all.length) return;
        const byId = new Map(all.map((c) => [c.id, c]));
        const merged = snapshots.map((snap) => {
          const live = byId.get(snap.id);
          if (!live) return snap;
          const fromMain = collectionCarouselCardImageFromLive(live);
          return { ...snap, title: live.display_title || live.title || snap.title, handle: live.handle || snap.handle, image: fromMain || "" };
        });
        setLiveCollections(merged);
      })
      .catch(() => {});
  }, [source, container.id, snapshots.length]);

  const collectionCards = (liveCollections ?? snapshots);

  let items = [];
  if (source === "images") {
    items = (container.images || []).filter((i) => i && localizedAsset(i, "url", locale));
  } else if (source === "collection") {
    items = products === undefined ? null : (products || []);
  } else {
    items = collectionCards;
  }

  if (source === "collection" && products === undefined) {
    return (
      <div style={{ ...getContainerPadding(container, "32px 24px"), background: bg }}>
        <div style={getContentInnerStyle(container, 1440)}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap, width: "100%" }}>
            {Array.from({ length: gridCols * 2 }).map((_, j) => (
              <div key={j} style={{ minHeight: 200, borderRadius: 10, background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)", backgroundSize: "800px 100%", animation: "shimmer 1.5s infinite linear" }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!items || !items.length) return null;

  const rows = buildMosaicRows(items, pattern);
  const productCaptionLines = source === "collection" ? parseLandingProductCaptions(container.product_captions) : [];

  const renderImage = (img) => {
    const r = String(img.aspect_ratio || "1/1").replace(/:/g, "/");
    const src = resolveUrl(lt(img, "url", locale));
    const imgTitle = lt(img, "title", locale);
    const imgText = lt(img, "text", locale);
    const hasTitle = !!(imgTitle && String(imgTitle).trim());
    const hasBody = !!(imgText && String(imgText).trim());
    const hasCaption = hasTitle || hasBody;
    const below = hasCaption ? (
      <div>
        {hasTitle ? <LandingItemHeading>{imgTitle}</LandingItemHeading> : null}
        <LandingItemSubtext html={imgText} marginTop={hasTitle ? 8 : 4} />
      </div>
    ) : null;
    const card = (
      <div>
        {/* "Container within container": a framed, padded shell around the image so a lone
            full-width row (e.g. a 1-column pattern) reads as a bounded card, not a bare oversized
            image dropped edge-to-edge on the page — and a maxHeight clamp keeps tall aspect ratios
            (or a very wide row) from growing without limit. */}
        <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 16, padding: 10, boxSizing: "border-box" }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: r, borderRadius: 10, overflow: "hidden", maxHeight: isNarrow ? 360 : 560 }}>
            <Image src={src} alt={imgTitle || ""} fill sizes="(max-width: 768px) 50vw, 400px" style={{ objectFit: "cover" }} />
          </div>
        </div>
        {below}
      </div>
    );
    if (img.link) return <a href={img.link} style={{ display: "block", textDecoration: "none" }}>{card}</a>;
    return card;
  };

  const renderProduct = (product, key, listIndex) => {
    const line = productCaptionLines[listIndex];
    const cap = line != null && String(line).trim() !== "" ? <LandingItemHeading>{line.trim()}</LandingItemHeading> : null;
    return (
      <div key={key} style={{ minWidth: 0 }}>
        <ProductCard product={product} plainImage />
        {cap}
      </div>
    );
  };

  const renderCollectionCard = (c, i, key) => {
    const href = collectionHref(c.handle);
    const image = resolveUrl(c.image);
    const el = (
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: ratio,
          borderRadius: 18,
          overflow: "hidden",
          background: "#f3f4f6",
          border: "1px solid #ececec",
        }}
      >
        {image ? (
          <Image src={image} alt={c.title || ""} fill sizes="(max-width: 768px) 50vw, 400px" style={{ objectFit: imgObjectFit }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>{tNav("collection")}</div>
        )}
        <div style={{ position: "absolute", inset: "auto 0 0 0", padding: "12px 14px", background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)", color: "#fff" }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{c.title || c.handle || `${tNav("collection")} ${i + 1}`}</div>
        </div>
      </div>
    );
    const sub = c.item_heading && String(c.item_heading).trim() ? <LandingItemHeading>{c.item_heading.trim()}</LandingItemHeading> : null;
    const block = href === "#" ? (
      <>
        {el}
        {sub}
      </>
    ) : (
      <>
        <a href={href} style={{ display: "block", textDecoration: "none" }}>{el}</a>
        {sub}
      </>
    );
    return <div key={key} style={{ minWidth: 0 }}>{block}</div>;
  };

  const renderFreeGridImage = (img, key) => {
    const src = resolveUrl(lt(img, "url", locale));
    const imgTitle = lt(img, "title", locale);
    const hasTitle = !!(imgTitle && String(imgTitle).trim());
    const colSpan = Math.max(1, Math.min(freeGridCols, Number(img.col_span) || 1));
    const rowSpan = Math.max(1, Math.min(6, Number(img.row_span) || 1));
    const cell = (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: 16,
          overflow: "hidden",
          background: "#f8f9fb",
          border: "1px solid #e5e7eb",
        }}
      >
        {src ? (
          <Image src={src} alt={imgTitle || ""} fill sizes="(max-width: 768px) 50vw, 500px" style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #eef0f2 0%, #e2e5e9 100%)" }} />
        )}
        {hasTitle && (
          <div style={{ position: "absolute", inset: "auto 0 0 0", padding: "14px 16px", background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.68) 100%)", color: "#fff" }}>
            <div style={{ fontSize: rowSpan > 1 ? 20 : 15, fontWeight: 800, lineHeight: 1.2 }}>{imgTitle}</div>
          </div>
        )}
      </div>
    );
    return (
      <div
        key={key}
        style={{
          gridColumn: `span ${colSpan}`,
          gridRow: `span ${rowSpan}`,
          minWidth: 0,
          boxSizing: "border-box",
          ...getImageCellPaddingStyle(img),
        }}
      >
        {img.link ? <a href={img.link} style={{ display: "block", width: "100%", height: "100%", textDecoration: "none" }}>{cell}</a> : cell}
      </div>
    );
  };

  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: bg }}>
      <div style={getContentInnerStyle(container, 1440)}>
        {lt(container, "title", locale) && (
          <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.5rem)", fontWeight: 700, color: "#111827", margin: "0 0 20px" }}>{lt(container, "title", locale)}</h2>
        )}
        {isFreeGrid ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${freeGridCols}, minmax(0, 1fr))`,
              gridAutoRows: `${freeGridRowHeight}px`,
              gridAutoFlow: "dense",
              gap,
              width: "100%",
            }}
          >
            {items.map((it, i) => renderFreeGridImage(it, `mg-${i}`))}
          </div>
        ) : isGridSource ? (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap, width: "100%", alignItems: "start" }}>
            {items.map((it, i) =>
              source === "collection"
                ? renderProduct(it, `m-${i}`, i)
                : renderCollectionCard(it, i, `m-${i}`)
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap, width: "100%" }}>
            {rows.map((rowItems, ri) => (
              <div
                key={ri}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${rowItems.length}, minmax(0, 1fr))`,
                  gap,
                  width: "100%",
                  alignItems: "start",
                }}
              >
                {rowItems.map((it, ci) => {
                  const k = `m-${ri}-${ci}`;
                  return (
                    <div
                      key={k}
                      style={{ minWidth: 0, boxSizing: "border-box", ...getImageCellPaddingStyle(it) }}
                    >
                      {renderImage(it)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Image Grid ────────────────────────────────────────────────────────────────
// Visual language matched to ContentMosaic (the reference block, TASKS.md 4.6): a framed
// "container within container" card around every image (not a bare edge-to-edge photo), a
// smart mobile column count instead of squeezing a 4-up desktop grid onto a phone, and a
// subtle hover lift on linked cells. All new knobs (cols_mobile, gap_mobile, bg_color) are
// optional with the old behavior as the default, so existing pages render unchanged.
function ImageGrid({ container, locale = "de" }) {
  const isNarrow = useIsNarrow(1023);
  const colsDesktop = Math.max(1, Math.min(6, Number(container.cols) || 2));
  const colsMobile = Math.max(1, Math.min(4, container.cols_mobile != null ? Number(container.cols_mobile) || 1 : Math.min(colsDesktop, 2)));
  const cols = isNarrow ? colsMobile : colsDesktop;
  const gapDesktop = Number(container.gap) || 16;
  const gapMobile = container.gap_mobile != null ? Number(container.gap_mobile) : null;
  const gap = isNarrow && gapMobile != null && !Number.isNaN(gapMobile) ? gapMobile : gapDesktop;
  const bg = container.bg_color || "transparent";
  const images = (container.images || []).filter((i) => localizedAsset(i, "url", locale));
  if (!images.length) return null;
  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: bg }}>
      <div style={{ ...getContentInnerStyle(container, 1100), display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
        {images.map((img, i) => {
          const ratio = img.aspect_ratio || "1/1";
          const imgTitle = lt(img, "title", locale);
          const imgText = lt(img, "text", locale);
          const imgEl = (
            <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 16, padding: 10, boxSizing: "border-box" }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: ratio, borderRadius: 10, overflow: "hidden" }}>
                <Image src={resolveUrl(lt(img, "url", locale))} alt={imgTitle || ""} fill sizes={`(max-width: 768px) 100vw, ${Math.round(100 / cols)}vw`} style={{ objectFit: "cover" }} />
              </div>
            </div>
          );
          const hasTitle = !!(imgTitle && String(imgTitle).trim());
          const hasBody = !!(imgText && String(imgText).trim());
          const caption = (hasTitle || hasBody) ? (
            <div>
              {hasTitle ? <LandingItemHeading>{imgTitle}</LandingItemHeading> : null}
              <LandingItemSubtext html={imgText} marginTop={hasTitle ? 8 : 4} />
            </div>
          ) : null;
          const inner = <>{imgEl}{caption}</>;
          return img.link
            ? <a key={i} href={img.link} className="landing-image-grid-item" style={{ display: "block", textDecoration: "none", minWidth: 0 }}>{inner}</a>
            : <div key={i} style={{ minWidth: 0 }}>{inner}</div>;
        })}
      </div>
      <style>{`.landing-image-grid-item{transition:transform .18s ease,box-shadow .18s ease;}.landing-image-grid-item:hover{transform:translateY(-2px);box-shadow:0 8px 20px -8px rgba(15,23,42,0.18);}`}</style>
    </div>
  );
}

// ── Banner CTA ────────────────────────────────────────────────────────────────
function BannerCta({ container, locale = "de" }) {
  const posStyle = getPositionStyle(container.text_position || "center");
  const padRaw = getContainerPadding(container, "32px 48px 40px 48px");
  // Eski horizontal-only kayıtlar 0 üst/alt veriyordu; buton/gölge taşmasın diye minimum.
  const pad =
    padRaw.paddingTop === "0px" && padRaw.paddingBottom === "0px"
      ? { ...padRaw, paddingTop: "32px", paddingBottom: "40px" }
      : padRaw;
  return (
    <div
      style={{
        background: container.bg_color || "#ff971c",
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
        ...pad,
        display: "flex",
        flexDirection: "column",
        ...posStyle,
      }}
    >
      <div style={getContentInnerStyle(container, 960)}>
        {lt(container, "title", locale) && (
          <h2 style={{ fontSize: "clamp(20px,3vw,36px)", fontWeight: 900, color: container.text_color || "#fff", margin: "0 0 8px", maxWidth: "100%" }}>
            {lt(container, "title", locale)}
          </h2>
        )}
        {lt(container, "subtitle", locale) && (
          <p style={{ fontSize: 16, color: container.subtitle_color || container.text_color || "#fff", margin: "0 0 20px", opacity: 0.9, maxWidth: "100%" }}>
            {lt(container, "subtitle", locale)}
          </p>
        )}
        {lt(container, "btn_text", locale) && container.btn_url && (
          <a
            href={container.btn_url}
            className="landing-cta-btn"
            style={{
              display: "inline-block",
              maxWidth: "100%",
              boxSizing: "border-box",
              padding: container.btn_padding || "12px 28px",
              background: container.btn_bg || "#fff",
              color: container.btn_color || "#111827",
              border: container.btn_border || "2px solid #000",
              borderRadius: container.btn_radius || 8,
              fontWeight: 800,
              fontSize: 14,
              textDecoration: "none",
              boxShadow: "0 2px 0 1px rgba(0,0,0,0.35)",
              marginBottom: 4,
              alignSelf: btnAlignSelf(posStyle.justifyContent),
            }}
          >
            {lt(container, "btn_text", locale)}
          </a>
        )}
      </div>
      <style>{`.landing-cta-btn{transition:transform .15s ease,box-shadow .15s ease,filter .15s ease;}.landing-cta-btn:hover{transform:translateY(-1px);filter:brightness(0.96);}.landing-cta-btn:active{transform:translateY(0);filter:brightness(0.92);}`}</style>
    </div>
  );
}

// ── Collection Carousel ───────────────────────────────────────────────────────
function CollectionCarousel({ container, preloadedProducts, locale = "de" }) {
  const tNav = useTranslations("nav");
  const tLanding = useTranslations("landing");
  // undefined = still loading, [] = loaded but empty, [...] = has products
  const [products, setProducts] = useState(preloadedProducts);
  const desktopN = container.items_per_row != null ? Number(container.items_per_row) : 4;
  const mobileN = container.items_per_row_mobile != null ? Number(container.items_per_row_mobile) : 2;
  const itemsPerRow = useResponsiveColumnCount(desktopN, mobileN);
  const isNarrow = useIsNarrow(1023);
  const baseGap = container.gap != null ? Number(container.gap) : 16;
  const gapMobile = container.gap_mobile != null ? Number(container.gap_mobile) : null;
  const gap = isNarrow && gapMobile != null && !Number.isNaN(gapMobile) ? gapMobile : (Number.isNaN(baseGap) ? 16 : baseGap);

  useEffect(() => {
    if (Array.isArray(preloadedProducts)) {
      setProducts(preloadedProducts);
      return;
    }
    if (!container.collection_id && !container.collection_handle) { setProducts([]); return; }
    const param = container.collection_id
      ? `collection_id=${encodeURIComponent(container.collection_id)}`
      : `collection_handle=${encodeURIComponent(container.collection_handle)}`;
    cachedJsonFetch(`/api/store-products?${param}&limit=20`, { ttlMs: 15000 })
      .then((d) => setProducts(Array.isArray(d?.products) ? d.products : []))
      .catch(() => setProducts([]));
  }, [container.collection_id, container.collection_handle, preloadedProducts]);

  // Still loading → show skeleton placeholder row
  if (products === undefined) {
    return (
      <div style={catalogSectionStyle(container, "48px 24px")}>
        <div style={{ display: "flex", gap, overflow: "hidden" }}>
          {Array.from({ length: itemsPerRow }).map((_, i) => (
            <div key={i} style={{ flex: `0 0 calc(${100 / itemsPerRow}% - 12px)`, height: 280, borderRadius: 10, background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)", backgroundSize: "800px 100%", animation: "shimmer 1.5s infinite linear" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!products.length) return null;

  const productCaptionLines = parseLandingProductCaptions(container.product_captions);
  const renderProductWithCaption = (product, i) => {
    const line = productCaptionLines[i];
    const cap = line != null && String(line).trim() !== "" ? <LandingItemHeading>{line.trim()}</LandingItemHeading> : null;
    return (
      <>
        <ProductCard product={product} plainImage />
        {cap}
      </>
    );
  };

  const { isGrid, rows, cols } = resolveMobilePagedGrid(container);
  if (isNarrow && isGrid) {
    return (
      <div style={catalogSectionStyle(container, "48px 24px")}>
        <div style={getContentInnerStyle(container, 1440)}>
          <MobilePagedGridScroll
            title={lt(container, "title", locale)}
            gap={gap}
            rows={rows}
            cols={cols}
            items={products}
            itemKey={(p, i) => p.id || i}
            renderItem={renderProductWithCaption}
            ariaLabel={lt(container, "title", locale) || tNav("product")}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={catalogSectionStyle(container, "48px 24px")}>
      <div style={getContentInnerStyle(container, 1440)}>
        <Carousel
          contained={false}
          title={lt(container, "title", locale) || undefined}
          visibleCount={itemsPerRow}
          navOnSides
          gap={gap}
          showFade={false}
          ariaLabel={lt(container, "title", locale) || tLanding("productCarousel")}
        >
          {products.map((product, i) => (
            <div key={product.id || i} style={{ minWidth: 0 }}>
              {renderProductWithCaption(product, i)}
            </div>
          ))}
        </Carousel>
      </div>
    </div>
  );
}

// ── Bestseller Carousel ───────────────────────────────────────────────────────
/** How much a discounted product is discounted, 0-1 — used to sort "sale" mode carousels. */
function discountPct(product) {
  const meta = product?.metadata || {};
  const dePrice = meta.prices?.DE;
  const base = dePrice?.brutto_cents != null ? Number(dePrice.brutto_cents) : getProductBasePriceCents(product);
  const sale = dePrice?.sale_cents != null ? Number(dePrice.sale_cents) : (meta.rabattpreis_cents != null ? Number(meta.rabattpreis_cents) : null);
  if (!base || sale == null || sale <= 0 || sale >= base) return 0;
  return 1 - sale / base;
}

function productRecencyMs(product) {
  const raw = product?.metadata?.publish_date || product?.created_at || product?.metadata?.created_at || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function BestsellerCarousel({ container, locale = "de", preloadedProducts }) {
  const tLanding = useTranslations("landing");
  const [products, setProducts] = useState(Array.isArray(preloadedProducts) ? preloadedProducts : undefined);
  const isNarrow = useIsNarrow(1023);
  const baseGap = container.gap != null ? Number(container.gap) : 10;
  const gap = Number.isNaN(baseGap) ? 10 : baseGap;
  const mode = container.mode === "sale" ? "sale" : container.mode === "newest" ? "newest" : "bestseller";
  const slug = String(container.category_slug || "").trim();

  useEffect(() => {
    if (Array.isArray(preloadedProducts)) {
      setProducts(preloadedProducts);
      return;
    }
    const qs = new URLSearchParams({ limit: "50" });
    if (slug) qs.set("category", slug);
    cachedJsonFetch(`/api/store-products?${qs.toString()}`, { ttlMs: 15000 })
      .then(async (d) => {
        const all = Array.isArray(d?.products) ? d.products : [];
        let next = all;
        if (mode === "sale") {
          const rules = await loadCatalogBadgeRules();
          next = all.filter((p) => isDiscountedProduct(p, rules.saleMinDiscountPercent)).sort((a, b) => discountPct(b) - discountPct(a));
        } else if (mode === "newest") {
          const days = await loadNewProductWindowDays();
          next = all.filter((p) => isWithinNewWindow(p, days)).sort((a, b) => productRecencyMs(b) - productRecencyMs(a));
        } else {
          next = [...all].sort((a, b) => toSalesScore(b.metadata) - toSalesScore(a.metadata));
        }
        const limit = Number(container.limit);
        if (Number.isFinite(limit) && limit > 0) next = next.slice(0, limit);
        setProducts(next);
      })
      .catch(() => setProducts([]));
  }, [slug, mode, container.limit, preloadedProducts]);

  if (products === undefined) {
    return (
      <div style={catalogSectionStyle(container, "48px 24px")}>
        <div style={{ display: "flex", gap, overflow: "hidden" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ flex: "0 0 180px", height: 240, borderRadius: 8, background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)", backgroundSize: "800px 100%", animation: "shimmer 1.5s infinite linear" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!products.length) return null;

  const seeAllHref = slug
    ? (mode === "sale" ? `/${slug}` : mode === "newest" ? `/${slug}` : `/${slug}?sort=bestseller`)
    : (mode === "sale" ? "/sales" : mode === "newest" ? "/neuheiten" : "/bestsellers");

  const { isGrid, rows, cols } = resolveMobilePagedGrid(container);
  const renderItem = (product, i) =>
    mode === "sale" || mode === "newest"
      ? <ProductCard product={product} plainImage />
      : <ProductCard product={product} plainImage isBestseller rank={i + 1} hideBestsellerBadge />;

  const seeAll = (
    <div style={{ textAlign: "center", marginTop: 12 }}>
      <SeeAllLink href={seeAllHref}>{tLanding("seeAll")}</SeeAllLink>
    </div>
  );

  if (isNarrow && isGrid) {
    return (
      <div style={{ ...getContainerPadding(container, "32px 16px"), background: container.bg_color || "transparent" }}>
        <div style={getContentInnerStyle(container, 1440)}>
          <MobilePagedGridScroll
            title={lt(container, "title", locale)}
            gap={gap}
            rows={rows}
            cols={cols}
            items={products}
            itemKey={(p, i) => p.id || i}
            renderItem={renderItem}
            ariaLabel={lt(container, "title", locale) || tLanding("bestsellers")}
          />
          {seeAll}
        </div>
      </div>
    );
  }

  return (
    // Horizontal padding matches tokens.containerPadding (24px) — Carousel's navOnSides bleed/
    // arrow-inset math is hardcoded to that value, so a narrower side padding here (the old 16px)
    // made the desktop nav arrows sit misaligned with this row's own edge.
    <div style={{ ...getContainerPadding(container, "48px 24px"), background: container.bg_color || "transparent" }}>
      <div style={getContentInnerStyle(container, 1440)}>
        <Carousel
          contained={false}
          title={lt(container, "title", locale) || undefined}
          itemWidth={180}
          visibleCount={isNarrow ? undefined : 5}
          navOnSides
          gap={gap}
          showFade={false}
          ariaLabel={lt(container, "title", locale) || tLanding("bestsellers")}
        >
          {products.map((product, i) => (
            <div key={product.id || i} style={{ minWidth: 0 }}>
              {renderItem(product, i)}
            </div>
          ))}
        </Carousel>
        {seeAll}
      </div>
    </div>
  );
}

// ── Personalized Product Row ──────────────────────────────────────────────────
function PersonalizedProductRow({ container, locale = "de" }) {
  const [products, setProducts] = useState(undefined);
  const isNarrow = useIsNarrow(1023);
  const baseGap = container.gap != null ? Number(container.gap) : 12;
  const gap = Number.isNaN(baseGap) ? 12 : baseGap;
  const visibleCount = Number(container.visible_count) || 4;
  const algorithm = container.algorithm || "top_picks";
  // Two ways to present the same personalized product list — a normal scrollable row of full
  // ProductCards (default, identical to before), or an editorial "image tile" mosaic (reusing
  // ContentMosaic's free grid: every product gets its own col/row span, so a bigger "top pick"
  // tile can sit beside smaller ones — see tile_spans below).
  const displayMode = container.display_mode === "image_tiles" ? "image_tiles" : "product_cards";
  const orientation = container.orientation === "vertical" ? "vertical" : "horizontal";
  const freeGridCols = Math.max(1, Math.min(6, Number(isNarrow ? (container.grid_cols_mobile ?? 2) : (container.grid_cols_desktop ?? 4)) || (isNarrow ? 2 : 4)));
  const freeGridRowHeight = Math.max(60, Number(isNarrow ? (container.grid_row_height_mobile ?? 140) : (container.grid_row_height_desktop ?? 180)) || (isNarrow ? 140 : 180));
  const tileSpans = Array.isArray(container.tile_spans) ? container.tile_spans : [];

  const DEFAULT_TITLES = {
    recently_viewed:  { de: "Weitermachen, wo du aufgehört hast", en: "Continue where you left off", tr: "Kaldığın yerden devam et" },
    reorder:          { de: "Schon früher bestellt — wieder bestellen?", en: "Order again?", tr: "Tekrar sipariş ver" },
    also_bought:      { de: "Andere kauften auch", en: "Others also bought", tr: "Başkaları da aldı" },
    trending_in_your_categories: { de: "Trends in deinen Kategorien", en: "Trending in your categories", tr: "Kategorilerinde trend" },
    trending_for_you: { de: "Trending für dich", en: "Trending for you", tr: "Senin için trend" },
    top_categories_bestsellers: { de: "Bestseller aus deinen Lieblingskategorien", en: "Bestsellers from your favorite categories", tr: "Favori kategorilerinden çok satanlar" },
    top_picks:        { de: "Top-Empfehlungen", en: "Top picks for you", tr: "Senin için seçtiklerimiz" },
    bestsellers:      { de: "Bestseller", en: "Bestsellers", tr: "Çok satanlar" },
    new_arrivals:     { de: "Neuheiten für dich", en: "New arrivals for you", tr: "Senin için yenilikler" },
    on_sale:          { de: "Angebote für dich", en: "Deals for you", tr: "Senin için fırsatlar" },
    favorited:        { de: "Deine Favoriten", en: "Your favorites", tr: "Favorilerin" },
    favorited_low_stock: { de: "Favoriten — bald ausverkauft", en: "Favorites — almost sold out", tr: "Favoriler — tükenmek üzere" },
    favorited_price_drop: { de: "Favoriten im Preis gesenkt", en: "Favorites with a price drop", tr: "Favorilerinde fiyat düştü" },
    category_bestsellers_from_purchases: { de: "Bestseller aus deinen Kaufkategorien", en: "Bestsellers from your purchase categories", tr: "Satın aldığın kategorilerden çok satanlar" },
    category_similar_from_favorites: { de: "Ähnlich zu deinen Favoriten", en: "Similar to your favorites", tr: "Favorilerine benzer" },
    others_in_your_category: { de: "Beliebt in deinen Kategorien", en: "Popular in your categories", tr: "Kategorilerinde popüler" },
    new_in_viewed_categories: { de: "Neu in deinen Kategorien", en: "New in your categories", tr: "Kategorilerinde yeni" },
    abandoned_cart_items: { de: "In deinem Warenkorb geblieben", en: "Left in your cart", tr: "Sepetinde kalanlar" },
  };

  function getTitle() {
    const custom = lt(container, "title", locale);
    if (custom) return custom;
    const algoTitles = DEFAULT_TITLES[algorithm] || DEFAULT_TITLES.top_picks;
    const loc = String(locale || "de").slice(0, 2).toLowerCase();
    return algoTitles[loc] || algoTitles.en || algoTitles.de;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const token = typeof localStorage !== "undefined" ? localStorage.getItem("andertal_customer_token") : null;
        const qs = new URLSearchParams({ algorithm, limit: String(Math.max(4, visibleCount * 2)) });
        const res = await fetch(`/api/personalized-products?${qs}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        const data = res.ok ? await res.json() : { products: [] };
        if (!cancelled) setProducts(Array.isArray(data?.products) ? data.products : []);
      } catch {
        if (!cancelled) setProducts([]);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [algorithm, visibleCount]);

  if (products === undefined) {
    return (
      <div style={{ ...getContainerPadding(container, "20px 16px"), background: container.bg_color || "transparent" }}>
        <div style={{ display: "flex", gap, overflow: "hidden" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: "0 0 200px",
                height: 260,
                borderRadius: 8,
                background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)",
                backgroundSize: "800px 100%",
                animation: "shimmer 1.5s infinite linear",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!products.length) return null;

  const title = getTitle();

  const renderTile = (product, i) => {
    const handle = storefrontProductHandle(product, locale);
    const href = handle ? `/${handle}` : null;
    const priceCents = getProductBasePriceCents(product);
    const span = tileSpans[i] || {};
    const colSpan = Math.max(1, Math.min(freeGridCols, Number(span.col_span) || 1));
    const rowSpan = Math.max(1, Math.min(4, Number(span.row_span) || 1));
    const thumb = resolveUrl(product.thumbnail);
    const cell = (
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 16, overflow: "hidden", background: "#f8f9fb", border: "1px solid #e5e7eb" }}>
        {thumb ? (
          <Image src={thumb} alt={product.title || ""} fill sizes="(max-width: 768px) 50vw, 500px" style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #eef0f2 0%, #e2e5e9 100%)" }} />
        )}
        <div style={{ position: "absolute", inset: "auto 0 0 0", padding: "14px 16px", background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)", color: "#fff" }}>
          <div style={{
            fontSize: rowSpan > 1 ? 19 : 14, fontWeight: 800, lineHeight: 1.25, marginBottom: 4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {product.title}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{formatPriceCents(priceCents)} €</div>
        </div>
      </div>
    );
    return (
      <div key={product.id || i} style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}`, minWidth: 0 }}>
        {href ? <a href={href} style={{ display: "block", width: "100%", height: "100%", textDecoration: "none" }}>{cell}</a> : cell}
      </div>
    );
  };

  return (
    // See BestsellerCarousel — horizontal padding matches tokens.containerPadding (24px) so the
    // Carousel's navOnSides arrows line up with this row's own edge instead of sitting misaligned.
    <div style={catalogSectionStyle(container, "48px 24px")}>
      <div style={getContentInnerStyle(container, 1440)}>
        {displayMode === "image_tiles" ? (
          <>
            {title && <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.5rem)", fontWeight: 700, color: "#111827", margin: "0 0 20px" }}>{title}</h2>}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${freeGridCols}, minmax(0, 1fr))`, gridAutoRows: `${freeGridRowHeight}px`, gridAutoFlow: "dense", gap, width: "100%" }}>
              {products.map((product, i) => renderTile(product, i))}
            </div>
          </>
        ) : orientation === "vertical" ? (
          <>
            {title && <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.5rem)", fontWeight: 700, color: "#111827", margin: "0 0 20px" }}>{title}</h2>}
            <div style={{ display: "flex", flexDirection: "column", gap, width: "100%" }}>
              {products.map((product, i) => (
                <div key={product.id || i} style={{ minWidth: 0 }}>
                  <ProductCard product={product} plainImage />
                </div>
              ))}
            </div>
          </>
        ) : (
          <Carousel
            contained={false}
            title={title || undefined}
            itemWidth={200}
            visibleCount={isNarrow ? undefined : visibleCount}
            navOnSides
            gap={gap}
            showFade={false}
            ariaLabel={title || "Personalized products"}
          >
            {products.map((product, i) => (
              <div key={product.id || i} style={{ minWidth: 0 }}>
                <ProductCard product={product} plainImage />
              </div>
            ))}
          </Carousel>
        )}
      </div>
    </div>
  );
}

// ── Seller Carousel ────────────────────────────────────────────────────────────
function BrandsDirectoryContainer({ container, locale = "de" }) {
  const title = lt(container, "title", locale);
  const perRow = container.items_per_row != null ? Number(container.items_per_row) : 5;
  const perRowMobile = container.items_per_row_mobile != null ? Number(container.items_per_row_mobile) : 2;
  const maxRows = container.max_rows != null ? Number(container.max_rows) : 10;
  const gap = container.gap != null ? Number(container.gap) : 14;
  const padStyle = getContainerPadding(container, "22px 24px 40px");
  // Keep the unit (e.g. "100%" for the mobile-authored row) — parseInt("100%") used to
  // truncate this to a literal 100px max-width, crushing the whole section on phones.
  const maxW = normalizeContentMaxWidth(container.content_max_width, 1440);
  return (
    <div style={padStyle}>
      <BrandsDirectoryBlock
        locale={locale}
        title={title}
        perRow={perRow}
        perRowMobile={perRowMobile}
        maxRows={maxRows}
        gap={gap}
        padding="0"
        maxWidth={maxW}
      />
    </div>
  );
}

function SellerCarousel({ container, locale = "de" }) {
  const tp = useTranslations("product");
  const [sellers, setSellers] = useState(undefined);
  const desktopN = container.items_per_row != null ? Number(container.items_per_row) : 4;
  const mobileN = container.items_per_row_mobile != null ? Number(container.items_per_row_mobile) : 2;
  const itemsPerRow = useResponsiveColumnCount(desktopN, mobileN);
  const baseGap = container.gap != null ? Number(container.gap) : 16;
  const gap = Number.isNaN(baseGap) ? 16 : baseGap;
  const limit = container.limit != null ? Number(container.limit) : 20;

  useEffect(() => {
    fetch(`/api/store-sellers?limit=${encodeURIComponent(limit)}`)
      .then((r) => r.json())
      .then((d) => setSellers(Array.isArray(d?.sellers) ? d.sellers : []))
      .catch(() => setSellers([]));
  }, [limit]);

  if (sellers === undefined) {
    return (
      <div style={catalogSectionStyle(container, "48px 24px")}>
        <div style={{ display: "flex", gap, overflow: "hidden" }}>
          {Array.from({ length: itemsPerRow }).map((_, i) => (
            <div key={i} style={{ flex: `0 0 calc(${100 / itemsPerRow}% - 12px)`, height: 160, borderRadius: 10, background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)", backgroundSize: "800px 100%", animation: "shimmer 1.5s infinite linear" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!sellers.length) return null;

  const title = lt(container, "title", locale);

  return (
    <div style={catalogSectionStyle(container, "48px 24px")}>
      <div style={getContentInnerStyle(container, 1440)}>
        <Carousel
          contained={false}
          title={title || undefined}
          visibleCount={itemsPerRow}
          navOnSides
          gap={gap}
          showFade={false}
          ariaLabel={title || tp("seller")}
        >
          {sellers.map((seller, i) => {
            const name = seller.store_name || seller.seller_label || seller.company_name || seller.email || "";
            const logoUrl = resolveUrl(seller.logo_url || seller.shop_logo_url || "");
            const href = seller.slug ? `/sellers/${seller.slug}` : (seller.id ? `/sellers/${seller.id}` : "#");
            return (
              <div key={seller.id || i} style={{ minWidth: 0 }}>
                <Link
                  href={href}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fafafa", textDecoration: "none", color: "inherit", textAlign: "center" }}
                >
                  {logoUrl ? (
                    <Image src={logoUrl} alt={name} width={64} height={64} style={{ objectFit: "contain", borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#6b7280" }}>
                      {(name[0] || "S").toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>{name || tp("seller")}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#2563eb" }}>{tp("toShop")}</span>
                </Link>
              </div>
            );
          })}
        </Carousel>
      </div>
    </div>
  );
}

function CollectionsCarousel({ container, locale = "de" }) {
  const tNav = useTranslations("nav");
  const tLanding = useTranslations("landing");
  const snapshots = Array.isArray(container.collections) ? container.collections.filter(Boolean) : [];
  const desktopN = container.items_per_row != null ? Number(container.items_per_row) : 4;
  const mobileN = container.items_per_row_mobile != null ? Number(container.items_per_row_mobile) : 2;
  const itemsPerRow = useResponsiveColumnCount(desktopN, mobileN);
  const isNarrow = useIsNarrow(1023);
  const baseGap = container.gap != null ? Number(container.gap) : 16;
  const gapMobile = container.gap_mobile != null ? Number(container.gap_mobile) : null;
  const gap = isNarrow && gapMobile != null && !Number.isNaN(gapMobile) ? gapMobile : (Number.isNaN(baseGap) ? 16 : baseGap);
  const ratio = normalizeCollectionsCarouselAspectRatio(container.card_aspect_ratio);
  const imgObjectFit =
    container.card_image_object_fit === "contain" ? "contain" : "cover";
  // A background square smaller than the image lets the image visually overflow it (the
  // "floating product" look) — 100% = no overflow, i.e. the old flush-background card.
  const bgEnabled = container.card_bg_enabled !== false;
  const bgColor = container.card_bg_color || "#f3f4f6";
  const bgHoverColor = container.card_bg_hover_color || bgColor;
  const bgSizePct = Math.min(100, Math.max(40, Number(container.card_bg_size) || 80));
  const bgInset = (100 - bgSizePct) / 2;

  // Fetch live collection data so title/image changes in admin are reflected immediately.
  const [liveCollections, setLiveCollections] = useState(null);
  const source = container.source === "categories"
    ? "categories"
    : container.source === "all"
      ? "all"
      : snapshots.length
        ? "manual"
        : (container.source === "manual" ? "manual" : "all");
  const itemLimit = Number(container.limit);
  const cap = Number.isFinite(itemLimit) && itemLimit > 0 ? itemLimit : 8;

  useEffect(() => {
    let cancelled = false;
    if (source === "categories") {
      cachedJsonFetch(`/api/store-categories${shallowCategoriesQuery(locale)}`, { ttlMs: 60000 })
        .then((data) => {
          if (cancelled) return;
          const tree = Array.isArray(data?.tree) ? data.tree : [];
          setLiveCollections(tree.slice(0, cap).map((cat) => {
            const locName = getLocalizedCategory(cat, locale).name || cat.name || cat.slug || "";
            const meta = cat.metadata && typeof cat.metadata === "object" ? cat.metadata : {};
            return {
              id: cat.id,
              title: locName,
              handle: cat.slug || cat.handle || "",
              image: cat.thumbnail || cat.image_url || meta.image_url || meta.image || "",
            };
          }));
        })
        .catch(() => { if (!cancelled) setLiveCollections([]); });
      return () => { cancelled = true; };
    }
    if (source === "all") {
      fetch("/api/store-collections")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const all = Array.isArray(data?.collections) ? data.collections : [];
          setLiveCollections(all.slice(0, cap).map((col) => ({
            id: col.id,
            title: col.display_title || col.title || col.handle || "",
            handle: col.handle || "",
            image: collectionCarouselCardImageFromLive(col),
          })));
        })
        .catch(() => { if (!cancelled) setLiveCollections([]); });
      return () => { cancelled = true; };
    }
    if (!snapshots.length) {
      setLiveCollections([]);
      return undefined;
    }
    // Manual list can mix collections and categories (added via the two separate pickers in the
    // editor) — only fetch each source when the list actually needs it.
    const hasCategoryItems = snapshots.some((s) => s.kind === "category");
    const hasCollectionItems = snapshots.some((s) => (s.kind || "collection") === "collection");
    const categoryIds = snapshots
      .filter((s) => s.kind === "category" && s.id)
      .map((s) => String(s.id).trim())
      .filter(Boolean);
    Promise.all([
      hasCollectionItems ? fetch("/api/store-collections").then((r) => r.json()).catch(() => ({ collections: [] })) : Promise.resolve({ collections: [] }),
      hasCategoryItems && categoryIds.length
        ? cachedJsonFetch(`/api/store-categories${storeCategoriesQuery(locale, { ids: categoryIds.join(",") })}`, { ttlMs: 60000 }).catch(() => null)
        : Promise.resolve(null),
    ]).then(([colData, catData]) => {
      if (cancelled) return;
      const allCollections = Array.isArray(colData?.collections) ? colData.collections : [];
      const byColId = new Map(allCollections.map((c) => [c.id, c]));
      const flatCats = Array.isArray(catData?.categories)
        ? catData.categories
        : (Array.isArray(catData?.tree) ? catData.tree : []);
      const byCatId = new Map(flatCats.map((c) => [c.id, c]));
      const merged = snapshots.map((snap) => {
        // A per-item custom image always wins; otherwise fall back to the collection's/category's
        // own current image, then to whatever was last cached on the snapshot.
        if ((snap.kind || "collection") === "category") {
          const live = byCatId.get(snap.id);
          if (!live) return { ...snap, image: snap.image_override || snap.image || "" };
          const locCat = getLocalizedCategory(live, locale);
          const meta = live.metadata && typeof live.metadata === "object" ? live.metadata : {};
          const liveImage = live.thumbnail || live.image_url || meta.image_url || meta.image || "";
          return {
            ...snap,
            title: locCat.name || live.name || snap.title,
            handle: live.slug || live.handle || snap.handle,
            image: snap.image_override || liveImage || "",
          };
        }
        const live = byColId.get(snap.id);
        if (!live) return { ...snap, image: snap.image_override || snap.image || "" };
        const fromMain = collectionCarouselCardImageFromLive(live);
        return {
          ...snap,
          title: live.display_title || live.title || snap.title,
          handle: live.handle || snap.handle,
          image: snap.image_override || fromMain || "",
        };
      });
      setLiveCollections(merged);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [container.id, source, locale, cap, snapshots.length]);

  const collections = source === "manual" ? (liveCollections ?? snapshots) : liveCollections;
  if (collections == null) {
    return (
      <div style={{ ...getContainerPadding(container, "48px 24px"), background: container.bg_color || "transparent" }}>
        <div style={{ display: "flex", gap, overflow: "hidden" }}>
          {Array.from({ length: itemsPerRow }).map((_, i) => (
            <div key={i} style={{ flex: `0 0 calc(${100 / itemsPerRow}% - 12px)`, height: 220, borderRadius: 12, background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)", backgroundSize: "800px 100%", animation: "shimmer 1.5s infinite linear" }} />
          ))}
        </div>
      </div>
    );
  }
  if (!collections.length) return null;

  const { isGrid, rows, cols } = resolveMobilePagedGrid(container);
  if (isNarrow && isGrid) {
    const renderCollectionCell = (collection, i) => {
      const href = collectionHref(collection.handle);
      const image = resolveUrl(collection.image);
      const card = (
        <div className="landing-cc-card" style={{ position: "relative", width: "100%", aspectRatio: ratio }}>
          {bgEnabled && (
            <div
              className="landing-cc-bg-sq"
              style={{ position: "absolute", inset: `${bgInset}%`, borderRadius: 14, background: bgColor, "--cc-bg-hover": bgHoverColor }}
            />
          )}
          <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", border: "1px solid #ececec" }}>
            {image ? (
              <Image src={image} alt={collection.title || ""} fill sizes="(max-width: 768px) 50vw, 400px" style={{ objectFit: imgObjectFit }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13, background: bgEnabled ? "transparent" : "#f3f4f6" }}>
                {tLanding("noPreview")}
              </div>
            )}
            <div
              style={{
                position: "absolute",
                inset: "auto 0 0 0",
                padding: "16px 18px",
                background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)",
                color: "#fff",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                {collection.title || collection.handle || `${tNav("collection")} ${i + 1}`}
              </div>
            </div>
          </div>
        </div>
      );
      const sub = collection.item_heading && String(collection.item_heading).trim() ? (
        <LandingItemHeading>{collection.item_heading.trim()}</LandingItemHeading>
      ) : null;
      if (href === "#") {
        return (
          <>
            {card}
            {sub}
          </>
        );
      }
      return (
        <>
          <a href={href} style={{ display: "block", textDecoration: "none" }}>{card}</a>
          {sub}
        </>
      );
    };
    return (
      <div style={catalogSectionStyle(container, "48px 24px")}>
        <div style={getContentInnerStyle(container, 1440)}>
          <MobilePagedGridScroll
            title={lt(container, "title", locale)}
            gap={gap}
            rows={rows}
            cols={cols}
            items={collections}
            itemKey={(c, i) => c.id || i}
            renderItem={renderCollectionCell}
            ariaLabel={lt(container, "title", locale) || tNav("collection")}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={catalogSectionStyle(container, "48px 24px")}>
      <div style={getContentInnerStyle(container, 1440)}>
        <Carousel
          contained={false}
          title={lt(container, "title", locale) || undefined}
          visibleCount={itemsPerRow}
          navOnSides
          gap={gap}
          ariaLabel={lt(container, "title", locale) || tLanding("collectionsCarousel")}
        >
          {collections.map((collection, i) => {
            const href = collectionHref(collection.handle);
            const image = resolveUrl(collection.image);
            const card = (
              <div className="landing-cc-card" style={{ position: "relative", width: "100%", aspectRatio: ratio }}>
                {bgEnabled && (
                  <div
                    className="landing-cc-bg-sq"
                    style={{ position: "absolute", inset: `${bgInset}%`, borderRadius: 14, background: bgColor, "--cc-bg-hover": bgHoverColor }}
                  />
                )}
                <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", border: "1px solid #ececec" }}>
                  {image ? (
                    <Image src={image} alt={collection.title || ""} fill sizes="(max-width: 768px) 50vw, 400px" style={{ objectFit: imgObjectFit }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13, background: bgEnabled ? "transparent" : "#f3f4f6" }}>
                      {tLanding("noPreview")}
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      inset: "auto 0 0 0",
                      padding: "16px 18px",
                      background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)",
                      color: "#fff",
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                      {collection.title || collection.handle || `${tNav("collection")} ${i + 1}`}
                    </div>
                  </div>
                </div>
              </div>
            );
            const sub = collection.item_heading && String(collection.item_heading).trim() ? (
              <LandingItemHeading>{collection.item_heading.trim()}</LandingItemHeading>
            ) : null;
            return (
              <div key={collection.id || i} style={{ minWidth: 0 }}>
                {href === "#" ? card : <a href={href} style={{ display: "block", textDecoration: "none" }}>{card}</a>}
                {sub}
              </div>
            );
          })}
        </Carousel>
      </div>
      <style>{`.landing-cc-bg-sq{transition:background-color .2s ease;}.landing-cc-card:hover .landing-cc-bg-sq{background-color:var(--cc-bg-hover);}`}</style>
    </div>
  );
}

// ── Single featured product ───────────────────────────────────────────────────
function SingleProduct({ container, preloadedProduct, locale = "de" }) {
  // undefined = loading, null = not found/no id, object = loaded
  const [product, setProduct] = useState(preloadedProduct !== undefined ? (preloadedProduct || null) : undefined);
  const idOrHandle = (container.product_id || container.product_handle || "").toString().trim();

  useEffect(() => {
    if (preloadedProduct !== undefined) {
      setProduct(preloadedProduct || null);
      return;
    }
    if (!idOrHandle) { setProduct(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { product: p } = await getMedusaClient().getProduct(idOrHandle);
        if (!cancelled) setProduct(p || null);
      } catch { if (!cancelled) setProduct(null); }
    })();
    return () => { cancelled = true; };
  }, [idOrHandle, preloadedProduct]);

  if (!idOrHandle) return null;
  // Still loading → small skeleton
  if (product === undefined) {
    return (
      <div style={{ ...getContainerPadding(container, "48px 24px"), background: container.bg_color || "transparent" }}>
        <div style={{ maxWidth: 420, margin: "0 auto", height: 360, borderRadius: 12, background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)", backgroundSize: "800px 100%", animation: "shimmer 1.5s infinite linear" }} />
      </div>
    );
  }
  if (!product) return null;

  const wrapBg = container.bg_color || "transparent";
  const title = lt(container, "title", locale);

  return (
    <div style={{ ...getContainerPadding(container, "48px 24px"), background: wrapBg }}>
      <div style={getContentInnerStyle(container, 420)}>
        {title ? (
          <h2 style={{
            fontSize: "clamp(20px,3vw,28px)",
            fontWeight: 800,
            color: container.text_color || "#111827",
            marginBottom: 20,
            textAlign: "center",
          }}>
            {title}
          </h2>
        ) : null}
        <ProductCard product={product} />
      </div>
    </div>
  );
}

// ── Featured blog posts (carousel: teaser ~3 lines + link to full post) ───────
function BlogCarousel({ container, locale = "de" }) {
  const tLanding = useTranslations("landing");
  const posts = Array.isArray(container.posts)
    ? container.posts.filter((p) => p && (p.title || p.image || p.excerpt || p.body))
    : [];
  const desktopN = container.items_per_row != null ? Number(container.items_per_row) : 3;
  const mobileN = container.items_per_row_mobile != null ? Number(container.items_per_row_mobile) : 1;
  const itemsPerRow = useResponsiveColumnCount(desktopN, mobileN);
  const gap = 16;

  if (!posts.length) return null;

  const bg = container.bg_color || "transparent";
  const textColor = container.text_color || "#111827";

  const previewClampStyle = {
    margin: 0,
    fontSize: 14,
    color: "#4b5563",
    lineHeight: 1.55,
    flex: 1,
    minHeight: 0,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  };

  return (
    <div style={{ ...getContainerPadding(container, "40px 24px"), background: bg }}>
      <div style={getContentInnerStyle(container, 1440)}>
        <Carousel
          contained={false}
          title={lt(container, "title", locale) || undefined}
          visibleCount={Math.min(itemsPerRow, posts.length)}
          navOnSides
          gap={gap}
          fadeBgColor={bg}
          ariaLabel={lt(container, "title", locale) || tLanding("blog")}
        >
          {posts.map((post, i) => {
          const id = post.id || `post-${i}`;
          const img = resolveUrl(post.image);
          const href = (post.href || "").trim();
          const preview = blogCardPreviewText(post);
          const blogLink = href
            ? href.startsWith("http")
              ? { external: true, to: href }
              : { external: false, to: `/${href.replace(/^\//, "")}` }
            : null;

          const CardInner = (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                overflow: "hidden",
                background: "#fafafa",
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {img ? (
                <div style={{ position: "relative", aspectRatio: "16/10", overflow: "hidden", background: "#eee" }}>
                  <Image src={img} alt={post.title || ""} fill sizes="(max-width: 768px) 90vw, 360px" style={{ objectFit: "cover" }} />
                </div>
              ) : null}
              <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: textColor, lineHeight: 1.25 }}>
                  {post.title || `Post ${i + 1}`}
                </div>
                {preview ? (
                  <p style={previewClampStyle}>{preview}</p>
                ) : (
                  <div style={{ flex: 1, minHeight: 8 }} />
                )}
                {blogLink ? (
                  blogLink.external ? (
                    <a
                      href={blogLink.to}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        alignSelf: "flex-start",
                        marginTop: "auto",
                        display: "inline-block",
                        border: "none",
                        background: "#111827",
                        color: "#fff",
                        padding: "10px 16px",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      Zum Blog →
                    </a>
                  ) : (
                    <Link
                      href={blogLink.to}
                      style={{
                        alignSelf: "flex-start",
                        marginTop: "auto",
                        display: "inline-block",
                        border: "none",
                        background: "#111827",
                        color: "#fff",
                        padding: "10px 16px",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      Zum Blog →
                    </Link>
                  )
                ) : null}
              </div>
            </div>
          );
          return <div key={id} style={{ height: "100%" }}>{CardInner}</div>;
        })}
        </Carousel>
      </div>
    </div>
  );
}

// ── Newsletter (form POST to external URL or internal endpoint) ───────────────
function NewsletterSignup({ container, locale = "de" }) {
  const tNewsletter = useTranslations("newsletter");
  const tAuth = useTranslations("auth");
  const action = (container.form_action || "").trim();
  const method = (container.form_method || "post").toLowerCase() === "get" ? "get" : "post";
  const firstNameFieldName = (container.first_name_field_name || "FNAME").trim() || "FNAME";
  const lastNameFieldName = (container.last_name_field_name || "LNAME").trim() || "LNAME";
  const emailName = (container.email_field_name || "EMAIL").trim() || "EMAIL";
  const hiddenFields = Array.isArray(container.hidden_fields) ? container.hidden_fields : [];
  const bg = container.bg_color || "#f3f4f6";
  const textColor = container.text_color || "#111827";
  const btnBg = container.btn_bg || "#111827";
  const btnColor = container.btn_color || "#fff";
  const [internalFirstName, setInternalFirstName] = React.useState("");
  const [internalLastName, setInternalLastName] = React.useState("");
  const [internalEmail, setInternalEmail] = React.useState("");
  const [internalState, setInternalState] = React.useState("idle"); // idle | loading | success | error

  const handleInternalSubmit = async (e) => {
    e.preventDefault();
    if (!internalFirstName.trim() || !internalLastName.trim() || !internalEmail || !internalEmail.includes("@")) return;
    setInternalState("loading");
    try {
      const backendUrl = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000");
      const r = await fetch(`${backendUrl}/store/newsletter-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: internalFirstName.trim(),
          last_name: internalLastName.trim(),
          email: internalEmail.trim().toLowerCase(),
          source: "landing_page",
          preferred_locale: locale || "de",
        }),
      });
      if (!r.ok) throw new Error("error");
      setInternalFirstName("");
      setInternalLastName("");
      setInternalEmail("");
      setInternalState("success");
    } catch {
      setInternalState("error");
    }
  };

  const sharedInputStyle = {
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
  };
  const sharedBtnStyle = {
    padding: "14px 20px",
    borderRadius: 10,
    border: "none",
    background: btnBg,
    color: btnColor,
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  };
  const nameRowStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  };
  const nameInputStyle = {
    flex: "1 1 160px",
    minWidth: 0,
    width: "auto",
  };

  return (
    <div style={{ ...getContainerPadding(container, "48px 24px"), background: bg }}>
      <div style={{ ...getContentInnerStyle(container, 560), textAlign: "center" }}>
        {lt(container, "title", locale) ? (
          <h2 style={{ fontSize: "clamp(20px,3vw,28px)", fontWeight: 800, color: textColor, margin: "0 0 8px" }}>
            {lt(container, "title", locale)}
          </h2>
        ) : null}
        {lt(container, "subtitle", locale) ? (
          <p style={{ margin: "0 0 20px", fontSize: 15, color: "#4b5563", lineHeight: 1.5 }}>
            {lt(container, "subtitle", locale)}
          </p>
        ) : null}
        {action ? (
          <form action={action} method={method} target="_blank" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
            {hiddenFields.map((f, i) => (
              f && f.name ? <input key={i} type="hidden" name={String(f.name)} value={String(f.value ?? "")} /> : null
            ))}
            <div style={nameRowStyle}>
              <input type="text" name={firstNameFieldName} required placeholder={lt(container, "first_name_placeholder", locale) || tAuth("firstName")} autoComplete="given-name" style={{ ...sharedInputStyle, ...nameInputStyle }} />
              <input type="text" name={lastNameFieldName} required placeholder={lt(container, "last_name_placeholder", locale) || tAuth("lastName")} autoComplete="family-name" style={{ ...sharedInputStyle, ...nameInputStyle }} />
            </div>
            <input type="email" name={emailName} required placeholder={lt(container, "email_placeholder", locale) || "E-Mail"} autoComplete="email" style={sharedInputStyle} />
            <button type="submit" style={sharedBtnStyle}>{lt(container, "button_text", locale) || "Abonnieren"}</button>
          </form>
        ) : internalState === "success" ? (
          <p style={{ fontSize: 16, color: "#059669", fontWeight: 600, margin: "12px 0 0" }}>
            {container.success_text || "Danke! Sie sind jetzt angemeldet."}
          </p>
        ) : (
          <form onSubmit={handleInternalSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
            <div style={nameRowStyle}>
              <input
                type="text"
                required
                value={internalFirstName}
                onChange={(e) => setInternalFirstName(e.target.value)}
                placeholder={lt(container, "first_name_placeholder", locale) || tAuth("firstName")}
                autoComplete="given-name"
                style={{ ...sharedInputStyle, ...nameInputStyle }}
              />
              <input
                type="text"
                required
                value={internalLastName}
                onChange={(e) => setInternalLastName(e.target.value)}
                placeholder={lt(container, "last_name_placeholder", locale) || tAuth("lastName")}
                autoComplete="family-name"
                style={{ ...sharedInputStyle, ...nameInputStyle }}
              />
            </div>
            <input
              type="email"
              required
              value={internalEmail}
              onChange={(e) => setInternalEmail(e.target.value)}
              placeholder={lt(container, "email_placeholder", locale) || "E-Mail"}
              autoComplete="email"
              style={sharedInputStyle}
            />
            <button type="submit" disabled={internalState === "loading"} style={{ ...sharedBtnStyle, opacity: internalState === "loading" ? 0.7 : 1 }}>
              {internalState === "loading" ? "…" : (lt(container, "button_text", locale) || "Abonnieren")}
            </button>
            {internalState === "error" && (
              <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>{tNewsletter("error")}</p>
            )}
          </form>
        )}
        {container.privacy_note ? (
          <p style={{ marginTop: 14, fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
            {container.privacy_note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Accordion ─────────────────────────────────────────────────────────────────
function AccordionChevron({ color, open }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Accordion({ container, locale = "de" }) {
  const [openIdx, setOpenIdx] = useState(null);
  const items = container.items || [];
  const bg = container.bg_color || "#ffffff";
  const textColor = container.text_color || "#111827";
  const borderColor = container.border_color || "#e5e7eb";
  const iconColor = container.icon_color || "#64748b";

  return (
    <div style={{ background: bg, ...getContainerPadding(container, "48px 24px") }}>
      <div style={getContentInnerStyle(container, 720)}>
        {lt(container, "title", locale) && (
          <h2
            style={{
              fontSize: "clamp(22px, 3.2vw, 34px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: textColor,
              margin: "0 0 32px",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            {lt(container, "title", locale)}
          </h2>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                style={{
                  borderRadius: 18,
                  border: `1px solid ${borderColor}`,
                  background: bg,
                  boxShadow: isOpen
                    ? "0 10px 40px -12px rgba(15, 23, 42, 0.12), 0 2px 8px -4px rgba(15, 23, 42, 0.06)"
                    : "0 1px 3px rgba(15, 23, 42, 0.05)",
                  overflow: "hidden",
                  transition: "box-shadow 0.3s ease, border-color 0.25s ease, background 0.25s ease",
                }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 20,
                    padding: "20px 24px",
                    background: "transparent",
                    border: "none",
                    borderLeft: isOpen ? `4px solid ${iconColor}` : "4px solid transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    boxSizing: "border-box",
                  }}
                >
                  <span
                    style={{
                      fontSize: "1.0625rem",
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      color: textColor,
                      flex: 1,
                      lineHeight: 1.35,
                    }}
                  >
                    {lt(item, "question", locale)}
                  </span>
                  <AccordionChevron color={iconColor} open={isOpen} />
                </button>
                <div
                  style={{
                    maxHeight: isOpen ? 3200 : 0,
                    opacity: isOpen ? 1 : 0,
                    transition: "max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
                    overflow: "hidden",
                    pointerEvents: isOpen ? "auto" : "none",
                  }}
                >
                  <div
                    style={{
                      padding: "4px 24px 22px 28px",
                      color: textColor,
                      fontSize: "0.984rem",
                      lineHeight: 1.75,
                    }}
                    dangerouslySetInnerHTML={{ __html: lt(item, "answer", locale) || "" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function Tabs({ container, locale = "de" }) {
  const tLanding = useTranslations("landing");
  const [activeIdx, setActiveIdx] = useState(0);
  const tabs = container.tabs || [];
  if (!tabs.length) return null;
  const bg = container.bg_color || "transparent";
  const textColor = container.text_color || "#111827";
  const activeColor = container.active_color || "#ff971c";
  const tabBg = container.tab_bg || "#f1f5f9";
  const style = container.tab_style || "underline";

  const tabStyle = (idx) => {
    const isActive = idx === activeIdx;
    const baseTransition =
      "color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease, border-color 0.25s ease";

    if (style === "pills") {
      return {
        padding: "11px 22px",
        borderRadius: 9999,
        border: "none",
        cursor: "pointer",
        fontSize: "0.9375rem",
        fontWeight: 600,
        letterSpacing: "-0.02em",
        background: isActive ? activeColor : "transparent",
        color: isActive ? "#fff" : textColor,
        transition: baseTransition,
        boxShadow: isActive
          ? `0 4px 14px -4px ${activeColor}99, 0 2px 6px -2px rgba(15, 23, 42, 0.08)`
          : "none",
        transform: isActive ? "translateY(-1px)" : "none",
      };
    }
    if (style === "boxes") {
      return {
        padding: "12px 20px",
        border: `1.5px solid ${isActive ? activeColor : "rgba(148, 163, 184, 0.35)"}`,
        cursor: "pointer",
        fontSize: "0.9375rem",
        fontWeight: 600,
        letterSpacing: "-0.02em",
        background: isActive ? `${activeColor}12` : "rgba(255,255,255,0.55)",
        color: isActive ? activeColor : textColor,
        borderRadius: 12,
        transition: baseTransition,
        boxShadow: isActive ? `0 0 0 1px ${activeColor}22 inset` : "none",
      };
    }
    return {
      padding: "14px 20px",
      marginBottom: -2,
      border: "none",
      borderBottom: `3px solid ${isActive ? activeColor : "transparent"}`,
      cursor: "pointer",
      fontSize: "0.9375rem",
      fontWeight: isActive ? 600 : 500,
      letterSpacing: "-0.02em",
      background: "transparent",
      color: isActive ? activeColor : textColor,
      opacity: isActive ? 1 : 0.78,
      transition: baseTransition,
      borderRadius: "10px 10px 0 0",
    };
  };

  const activeTab = tabs[activeIdx] || tabs[0];

  const barWrap = (() => {
    if (style === "underline") {
      return {
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        borderBottom: "2px solid rgba(148, 163, 184, 0.35)",
        marginBottom: 0,
        paddingBottom: 0,
      };
    }
    if (style === "pills") {
      return {
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: 6,
        borderRadius: 9999,
        background: tabBg,
        boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.06)",
        marginBottom: 0,
        width: "fit-content",
        maxWidth: "100%",
      };
    }
    return {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      padding: 4,
      borderRadius: 16,
      background: tabBg,
      marginBottom: 0,
      border: "1px solid rgba(148, 163, 184, 0.25)",
      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
      width: "fit-content",
      maxWidth: "100%",
    };
  })();

  return (
    <div style={{ background: bg, ...getContainerPadding(container, "48px 24px") }}>
      <div style={getContentInnerStyle(container, 880)}>
        <div
          style={{
            marginBottom: 22,
            ...(style === "underline" ? {} : { display: "flex", justifyContent: "flex-start", flexWrap: "wrap", gap: 12 }),
          }}
        >
          <div role="tablist" aria-label={tLanding("contentTabs")} style={barWrap}>
            {tabs.map((tab, idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === activeIdx}
                style={tabStyle(idx)}
                onClick={() => setActiveIdx(idx)}
              >
                {lt(tab, "label", locale)}
              </button>
            ))}
          </div>
        </div>
        {activeTab && (
          <div
            role="tabpanel"
            style={{
              color: textColor,
              fontSize: "0.984rem",
              lineHeight: 1.78,
              padding: "28px 32px",
              borderRadius: 20,
              background: `linear-gradient(165deg, ${tabBg} 0%, ${bg} 72%)`,
              border: "1px solid rgba(148, 163, 184, 0.28)",
              boxShadow: "0 4px 28px -8px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.05)",
              minHeight: 48,
            }}
            dangerouslySetInnerHTML={{ __html: lt(activeTab, "content", locale) || "" }}
          />
        )}
      </div>
    </div>
  );
}

// ── Feature Grid ──────────────────────────────────────────────────────────────
function FeatureGrid({ container, locale = "de" }) {
  const {
    title_align = "center",
    cols = 3, card_style = "flat",
    icon_size = "40px",
    bg_color, card_bg = "transparent",
    card_border_color = "#e5e7eb", text_color = "#111827",
    items = [],
    variant = "cards",
  } = container;
  const title = lt(container, "title", locale);
  const subtitle = lt(container, "subtitle", locale);
  const isStrip = variant === "stats_strip";

  const cardStyle = (() => {
    const base = {
      background: isStrip ? "transparent" : card_bg,
      color: text_color,
      padding: isStrip ? "8px 4px" : "20px 8px",
      borderRadius: isStrip ? 0 : 12,
      display: "flex",
      flexDirection: "column",
      gap: isStrip ? 6 : 10,
      textAlign: isStrip || title_align === "center" ? "center" : "left",
      alignItems: isStrip || title_align === "center" ? "center" : "flex-start",
    };
    if (isStrip || card_style === "flat") return base;
    if (card_style === "bordered") return { ...base, border: `1px solid ${card_border_color}` };
    if (card_style === "shadow") return { ...base, boxShadow: "0 4px 24px -6px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.06)" };
    return base;
  })();

  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div style={{ background: bg_color || "transparent", ...getContainerPadding(container, "48px 24px") }}>
      <div style={getContentInnerStyle(container, 1440)}>
        {(title || subtitle) && (
          <div style={{ textAlign: title_align, marginBottom: 40 }}>
            {title && (
              <h2 style={{ margin: "0 0 12px", fontSize: "clamp(1.5rem,3.5vw,2.25rem)", fontWeight: 700, color: text_color, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ margin: 0, fontSize: "1.0625rem", color: text_color, opacity: 0.7, maxWidth: 560, ...(title_align === "center" ? { marginLeft: "auto", marginRight: "auto" } : {}) }}>
                {subtitle}
              </p>
            )}
          </div>
        )}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(1, cols)}, 1fr)`,
          gap: isStrip ? 12 : 20,
        }}
          className={isStrip ? "landing-feature-grid landing-feature-strip" : "landing-feature-grid"}
        >
          {items.map((item, i) => (
            <div key={i} style={cardStyle}>
              {item.icon && (
                <div style={{ fontSize: icon_size, lineHeight: 1 }}>{item.icon}</div>
              )}
              {lt(item, "title", locale) && (
                <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: text_color, margin: 0 }}>{lt(item, "title", locale)}</div>
              )}
              {(lt(item, "body", locale) || lt(item, "description", locale)) && (
                <div style={{ fontSize: "0.9375rem", color: text_color, opacity: 0.72, lineHeight: 1.6, margin: 0 }}>{lt(item, "body", locale) || lt(item, "description", locale)}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:767px){.landing-feature-grid{grid-template-columns:1fr!important;}.landing-feature-strip{grid-template-columns:repeat(2,1fr)!important;}}@media(min-width:768px) and (max-width:1023px){.landing-feature-grid{grid-template-columns:repeat(2,1fr)!important;}.landing-feature-strip{grid-template-columns:repeat(4,1fr)!important;}}`}</style>
    </div>
  );
}

// ── Testimonials ──────────────────────────────────────────────────────────────
function Testimonials({ container, locale = "de" }) {
  const {
    title_align = "center",
    cols = 3, show_stars = true,
    bg_color = "#f9fafb", card_bg = "#ffffff",
    card_border_color = "#e5e7eb", text_color = "#111827",
    accent_color = "#ff971c",
    items = [],
  } = container;
  const title = lt(container, "title", locale);
  const subtitle = lt(container, "subtitle", locale);

  const stars = (n) => Array.from({ length: 5 }, (_, i) => (
    <span key={i} style={{ color: i < n ? accent_color : "#d1d5db", fontSize: "0.875rem" }}>★</span>
  ));

  return (
    <div style={{ background: bg_color, ...getContainerPadding(container, "64px 24px") }}>
      <div style={getContentInnerStyle(container, 1200)}>
        {(title || subtitle) && (
          <div style={{ textAlign: title_align, marginBottom: 40 }}>
            {title && (
              <h2 style={{ margin: "0 0 12px", fontSize: "clamp(1.5rem,3.5vw,2.25rem)", fontWeight: 700, color: text_color, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ margin: 0, fontSize: "1.0625rem", color: text_color, opacity: 0.7, maxWidth: 560, ...(title_align === "center" ? { marginLeft: "auto", marginRight: "auto" } : {}) }}>
                {subtitle}
              </p>
            )}
          </div>
        )}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(1, cols)}, 1fr)`,
          gap: 20,
        }}
          className="landing-testimonials-grid"
        >
          {items.map((item, i) => (
            <div key={i} style={{
              background: card_bg,
              border: `1px solid ${card_border_color}`,
              borderRadius: 16,
              padding: "28px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              color: text_color,
            }}>
              {show_stars && item.rating > 0 && (
                <div style={{ display: "flex", gap: 2 }}>{stars(Number(item.rating) || 5)}</div>
              )}
              {lt(item, "quote", locale) && (
                <p style={{ margin: 0, fontSize: "0.9688rem", lineHeight: 1.7, color: text_color, flex: 1 }}>
                  "{lt(item, "quote", locale)}"
                </p>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto" }}>
                {localizedAsset(item, "avatar", locale) ? (
                  <img
                    src={resolveUrl(lt(item, "avatar", locale))}
                    alt={lt(item, "author", locale) || ""}
                    style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${card_border_color}` }}
                  />
                ) : null}
                {!localizedAsset(item, "avatar", locale) && (
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: accent_color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1rem", fontWeight: 700, color: "#fff" }}>
                    {(lt(item, "author", locale) || "?")[0].toUpperCase()}
                  </div>
                )}
                <div>
                  {lt(item, "author", locale) && <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: text_color }}>{lt(item, "author", locale)}</div>}
                  {lt(item, "role", locale) && <div style={{ fontSize: "0.8125rem", color: text_color, opacity: 0.6 }}>{lt(item, "role", locale)}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:767px){.landing-testimonials-grid{grid-template-columns:1fr!important;}}@media(min-width:768px) and (max-width:1023px){.landing-testimonials-grid{grid-template-columns:repeat(2,1fr)!important;}}`}</style>
    </div>
  );
}

/** Landing slide / mosaic image: optional per-cell padding (Seller: cell_padding_*). */
function getImageCellPaddingStyle(item) {
  if (!item || typeof item !== "object") return {};
  const toLen = (v) => {
    if (v == null || v === "") return undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    if (/^[\d.]+(px|em|rem|%|vw|vh)$/i.test(s) || s.includes("calc(")) return s;
    if (/^[\d.]+$/.test(s)) return `${s}px`;
    return s;
  };
  const pl = toLen(item.cell_padding_left);
  const pr = toLen(item.cell_padding_right);
  const pt = toLen(item.cell_padding_top);
  const pb = toLen(item.cell_padding_bottom);
  const out = {};
  if (pl) out.paddingLeft = pl;
  if (pr) out.paddingRight = pr;
  if (pt) out.paddingTop = pt;
  if (pb) out.paddingBottom = pb;
  return out;
}

// ── Image Carousel ────────────────────────────────────────────────────────────
function normalizeImageCarouselAspect(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^[\d.]+$/.test(s)) return s;
  return s.replace(/:/g, "/").replace(/\s+/g, "");
}

function aspectRatioToNumber(raw, fallback = 0.8) {
  const s = normalizeImageCarouselAspect(raw);
  if (!s) return fallback;
  if (/^[\d.]+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  const m = s.match(/^([\d.]+)\/([\d.]+)$/);
  if (!m) return fallback;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return fallback;
  return a / b;
}

/**
 * Pro Slide: optionale Desktop-/Mobil-Seitenverhältnisse und min. Höhe (Mobil) aus dem Seller-Editor.
 */
function pickImageCarouselRatio(container, isNarrow) {
  const desktop = normalizeImageCarouselAspect(container?.aspect_ratio_custom) || normalizeImageCarouselAspect(container?.aspect_ratio) || "4/5";
  if (!isNarrow) return desktop;
  const mobileCustom = normalizeImageCarouselAspect(container?.aspect_ratio_mobile_custom);
  if (mobileCustom) return mobileCustom;
  const mobile = normalizeImageCarouselAspect(container?.aspect_ratio_mobile);
  if (mobile) return mobile;
  return desktop;
}

function ImageCarousel({ container, locale = "de", isFirstContainer = false }) {
  const tLanding = useTranslations("landing");
  const tCommon = useTranslations("common");
  const isNarrow = useIsNarrow(1023);
  const images = (container.images || []).filter((i) => localizedAsset(i, "url", locale));
  const { setLandingHeaderBg } = useLandingChrome();
  const mobileScrollRef = useRef(null);
  const desktopScrollRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Track active slide for header gradient
  useEffect(() => {
    if (!isNarrow || !isFirstContainer) return;
    const el = mobileScrollRef.current;
    if (!el) return;
    const update = () => {
      const children = Array.from(el.children);
      const cCenter = el.scrollLeft + el.clientWidth / 2;
      let best = 0, bestDist = Infinity;
      children.forEach((item, i) => {
        const dist = Math.abs((item.offsetLeft + item.offsetWidth / 2) - cCenter);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      setActiveIdx(best);
    };
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => el.removeEventListener("scroll", update);
  }, [isNarrow, isFirstContainer]);

  useEffect(() => {
    if (!isFirstContainer) return;
    const img = images[activeIdx];
    if (img?.color) {
      const dir = img.gradient_direction || "to bottom";
      const stop = img.gradient_stop || "80%";
      setLandingHeaderBg(`linear-gradient(${dir}, ${img.color} 0%, transparent ${stop})`, img.color);
    } else {
      setLandingHeaderBg(null);
    }
  }, [activeIdx, isFirstContainer, images, setLandingHeaderBg]);

  // Clear gradient on unmount
  useEffect(() => {
    return () => setLandingHeaderBg(null);
  }, []);

  if (!images.length) return null;
  const baseGap = container.gap != null ? Number(container.gap) : 16;
  const gapMobile = container.gap_mobile != null ? Number(container.gap_mobile) : null;
  const gap = isNarrow && gapMobile != null && !Number.isNaN(gapMobile) ? gapMobile : (Number.isNaN(baseGap) ? 16 : baseGap);
  const bg = container.bg_color || "transparent";
  const { isGrid, rows, cols } = resolveMobilePagedGrid(container);
  const rawPad = getContainerPadding(container, "0px 24px 0px 24px");
  const carouselPadding = { ...rawPad, paddingTop: 0, paddingBottom: 0 };
  const maxHDesktop = container.max_height != null ? String(container.max_height).trim() : "";
  const maxHMobile = container.max_height_mobile != null ? String(container.max_height_mobile).trim() : "";
  const mobileRatio = pickImageCarouselRatio(container, true);
  const mobileRatioNum = aspectRatioToNumber(mobileRatio, 0.8);
  const mobileItemWidthPx = Math.max(110, Math.min(320, Math.round(260 * mobileRatioNum)));
  // mobile_item_width accepts any CSS length (vw, %, px). Falls back to calculated px value.
  const mobileItemW = String(container.mobile_item_width || "").trim() || `${mobileItemWidthPx}px`;
  // desktop_item_width accepts any CSS length (px, vw, calc(...)). Falls back to the legacy
  // "images per row" count, evenly dividing the ~1280px content box (same math the old fixed-
  // column Carousel used), so containers configured before this became a peek-scroll still get a
  // sensible width instead of silently ignoring their existing setting.
  const desktopN = Math.max(1, container.items_per_row != null ? Number(container.items_per_row) || 4 : 4);
  const desktopItemWidthPx = Math.max(160, Math.floor((1280 - gap * (desktopN - 1)) / desktopN));
  const desktopItemW = String(container.desktop_item_width || "").trim() || `${desktopItemWidthPx}px`;
  const scrollByOneItem = (ref, dir) => {
    const el = ref.current;
    if (!el) return;
    const child = el.firstElementChild;
    const step = (child ? child.getBoundingClientRect().width : 300) + gap;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const renderImageCell = (img, isFirstImage = false, sizesHint = "(max-width: 768px) 90vw, 400px") => {
    const src = resolveUrl(lt(img, "url", locale));
    const ratio = pickImageCarouselRatio(container, isNarrow);
    const minH = isNarrow && (container.min_height_mobile != null) && String(container.min_height_mobile).trim() !== "";
    const maxH = isNarrow ? (maxHMobile || maxHDesktop) : maxHDesktop;
    const boxStyle = {
      position: "relative",
      width: "100%",
      aspectRatio: ratio,
      overflow: "hidden",
      borderRadius: 12,
      background: "#f3f4f6",
      ...(minH ? { minHeight: String(container.min_height_mobile).trim() } : {}),
      ...(maxH ? { maxHeight: maxH } : {}),
    };
    const imgTitle = lt(img, "title", locale);
    const imgText = lt(img, "text", locale);
    const hasTitle = !!(imgTitle && String(imgTitle).trim());
    const hasBody = !!(imgText && String(imgText).trim());
    const cap = (hasTitle || hasBody) ? (
      <div>
        {hasTitle ? <LandingItemHeading>{imgTitle}</LandingItemHeading> : null}
        <LandingItemSubtext html={imgText} marginTop={hasTitle ? 8 : 4} />
      </div>
    ) : null;
    const block = (
      <>
        <div style={boxStyle}>
          {/* priority (fetchpriority=high, no lazy) only on the very first cell of the
              first-shown carousel — that's the mobile LCP element per the Lighthouse trace;
              next/image already lazy-loads everything else by default. */}
          <Image
            src={src}
            alt={imgTitle || ""}
            fill
            sizes={sizesHint}
            style={{ objectFit: "cover" }}
            priority={isFirstImage}
          />
        </div>
        {cap}
      </>
    );
    const pad = getImageCellPaddingStyle(img);
    const shell = (child) => (
      <div style={{ minWidth: 0, boxSizing: "border-box", ...pad }}>{child}</div>
    );
    if (img.link) {
      return shell(<a href={img.link} style={{ display: "block", textDecoration: "none" }}>{block}</a>);
    }
    return shell(<div>{block}</div>);
  };

  // Opt-in grid mode (default stays the carousel above — existing containers are unaffected):
  // a plain, non-scrolling CSS grid using the same "images per row" fields as before, capped to
  // grid_rows so e.g. a 2×2 product square shows exactly 4 images regardless of how many are
  // configured. Reuses renderImageCell, so links/captions/padding/aspect all behave identically.
  if (container.display_mode === "grid") {
    const gridColsDesktop = Math.max(1, Math.min(6, Number(container.items_per_row) || 4));
    const gridColsMobile = Math.max(1, Math.min(4, Number(container.items_per_row_mobile) || 2));
    const gridCols = isNarrow ? gridColsMobile : gridColsDesktop;
    const gridRows = Math.max(1, Math.min(6, Number(container.grid_rows) || 1));
    const shown = images.slice(0, gridCols * gridRows);
    return (
      <div style={{ ...carouselPadding, background: bg }}>
        <div style={getContentInnerStyle(container, 1440)}>
          {lt(container, "title", locale) && (
            <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.375rem)", fontWeight: 600, margin: "0 0 16px" }}>{lt(container, "title", locale)}</h2>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap, width: "100%" }}>
            {shown.map((img, i) => (
              <div key={i} style={{ minWidth: 0 }}>
                {renderImageCell(img, isFirstContainer && i === 0, `(max-width: 768px) ${Math.round(100 / gridCols)}vw, ${Math.round(1280 / gridCols)}px`)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isNarrow && isGrid) {
    return (
      <div style={{ ...carouselPadding, background: bg }}>
        <div style={getContentInnerStyle(container, 1440)}>
          <MobilePagedGridScroll
            title={lt(container, "title", locale)}
            gap={gap}
            rows={rows}
            cols={cols}
            items={images}
            itemKey={(_, i) => `img-${i}`}
            renderItem={renderImageCell}
            ariaLabel={lt(container, "title", locale) || tLanding("imageCarousel")}
          />
        </div>
      </div>
    );
  }

  // Mobile: native scroll-snap peek carousel
  // First image left-anchored, middle images center-snapped, last image right-anchored.
  // Edge padding (from container padding settings) applies only to first and last items.
  if (isNarrow) {
    const padLeft = rawPad.paddingLeft || "0px";
    const padRight = rawPad.paddingRight || "0px";
    const title = lt(container, "title", locale);
    return (
      <div style={{ background: bg }}>
        {title && (
          <div style={{ padding: `0 ${padLeft}`, marginBottom: 12 }}>
            <h2 style={{ fontSize: "clamp(1rem, 2vw, 1.375rem)", fontWeight: 600, margin: 0 }}>{title}</h2>
          </div>
        )}
        <div
          ref={mobileScrollRef}
          style={{
            display: "flex",
            gap: `${gap}px`,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {images.map((img, i) => {
            const isFirst = i === 0;
            const isLast = i === images.length - 1;
            return (
              <div
                key={i}
                style={{
                  flexShrink: 0,
                  width: mobileItemW,
                  minWidth: mobileItemW,
                  scrollSnapAlign: isFirst ? "start" : isLast ? "end" : "center",
                  ...(isFirst ? { marginLeft: padLeft } : {}),
                  ...(isLast ? { marginRight: padRight, scrollMarginRight: padRight } : {}),
                }}
              >
                {renderImageCell(img, isFirstContainer && isFirst, `(max-width: 768px) ${mobileItemW}, 400px`)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── DESKTOP: same native scroll-snap peek carousel as mobile (only item width + edge-anchoring
  // differ), so the section looks and behaves consistently across breakpoints. Arrow buttons are
  // added since a mouse doesn't swipe as naturally as a touch gesture; the underlying scroll-snap
  // still works with drag/wheel either way.
  return (
    <div style={{ ...carouselPadding, background: bg }}>
      <div style={getContentInnerStyle(container, 1440)}>
        {lt(container, "title", locale) && (
          <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.375rem)", fontWeight: 600, margin: "0 0 16px" }}>{lt(container, "title", locale)}</h2>
        )}
        <div style={{ position: "relative" }}>
          <div
            className="landing-peek-scroll"
            ref={desktopScrollRef}
            style={{
              display: "flex",
              gap: `${gap}px`,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              scrollBehavior: "smooth",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              paddingBottom: 4,
            }}
          >
            {images.map((img, i) => {
              const isFirst = i === 0;
              const isLast = i === images.length - 1;
              return (
                <div
                  key={i}
                  style={{
                    flexShrink: 0,
                    width: desktopItemW,
                    minWidth: desktopItemW,
                    scrollSnapAlign: isFirst ? "start" : isLast ? "end" : "center",
                  }}
                >
                  {renderImageCell(img, isFirstContainer && isFirst, `${desktopItemW}`)}
                </div>
              );
            })}
          </div>
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label={tCommon("previous")}
                onClick={() => scrollByOneItem(desktopScrollRef, -1)}
                style={{ position: "absolute", left: -8, top: "50%", transform: "translate(-50%, -50%)", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3, boxShadow: "0 2px 8px rgba(0,0,0,0.14)" }}
              >‹</button>
              <button
                type="button"
                aria-label={tCommon("next")}
                onClick={() => scrollByOneItem(desktopScrollRef, 1)}
                style={{ position: "absolute", right: -8, top: "50%", transform: "translate(50%, -50%)", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3, boxShadow: "0 2px 8px rgba(0,0,0,0.14)" }}
              >›</button>
            </>
          )}
        </div>
      </div>
      <style>{`.landing-peek-scroll::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

// ── Layout Section: the one container type meant to nest — splits the section into N columns,
// each column ("slot") holding any other container (including another layout_section, up to the
// shared depth-3 cap enforced by landing-container-tree.js + the backend's sanitizeAnyContainer).
// See docs/SUPPORT-LANDING-STEP1-ARCHITECTURE.md §2.1/§3.1. Deliberately NOT content_mosaic —
// mosaic stays a flat images-or-products grid; this is the actual "box inside a box" primitive.
function layoutSectionTemplate(cols, widths) {
  if (Array.isArray(widths) && widths.length === cols) {
    return widths.map((w) => `${Math.max(0.1, Number(w) || 1)}fr`).join(" ");
  }
  return `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`;
}

function LayoutSection({ container, locale = "de", preload = {}, ctx = {} }) {
  const children = Array.isArray(container.children) ? container.children.filter(Boolean) : [];
  if (!children.length) return null;

  const colsDesktop = Math.max(1, Math.min(4, Number(container.columns_desktop ?? container.columns) || 1));
  const colsTablet = Math.max(1, Math.min(4, Number(container.columns_tablet) || colsDesktop));
  const colsMobile = Math.max(1, Math.min(4, Number(container.columns_mobile) || 1));
  const gap = container.gap != null ? Number(container.gap) : 16;
  const gapMobile = container.gap_mobile != null ? Number(container.gap_mobile) : gap;
  const widths = Array.isArray(container.column_widths) ? container.column_widths : null;
  const bg = container.bg_color || undefined;
  const titleAlign = container.title_align === "center" ? "center" : "left";
  const title = container.show_title === false ? "" : lt(container, "title", locale);

  // Optional per-cell "card" chrome (aspect ratio / background / radius / height clamp) — applied
  // uniformly to every slot; a slot's own container still renders its normal content inside it.
  const cellAspect = container.cell_aspect && container.cell_aspect !== "auto"
    ? String(container.cell_aspect === "custom" ? (container.cell_aspect_custom || "") : container.cell_aspect).replace(/:/g, "/")
    : "";
  const cellRadius = container.cell_radius != null ? Number(container.cell_radius) || 0 : 0;
  const cellBg = container.cell_bg || "";
  const cellMinH = container.cell_min_height ? String(container.cell_min_height).trim() : "";
  const cellMaxH = container.cell_max_height ? String(container.cell_max_height).trim() : "";
  const needsCellShell = !!(cellAspect || cellBg || cellRadius || cellMinH || cellMaxH);
  const cls = `ls-${String(container.id || "x").replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: bg }}>
      <div style={getContentInnerStyle(container, 1440)}>
        {title && (
          <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.5rem)", fontWeight: 700, color: container.text_color || "#111827", margin: "0 0 20px", textAlign: titleAlign }}>
            {title}
          </h2>
        )}
        <div
          className={cls}
          style={{
            display: "grid",
            gridTemplateColumns: layoutSectionTemplate(colsDesktop, widths),
            gap,
            alignItems: container.cell_align === "start" ? "start" : "stretch",
          }}
        >
          {children.map((child, i) => {
            const rendered = renderContainer(child, preload, ctx, { isChild: true });
            if (rendered == null) return null;
            return (
              <div
                key={child.id || i}
                style={{
                  minWidth: 0,
                  ...(needsCellShell ? {
                    background: cellBg || undefined,
                    borderRadius: cellRadius || undefined,
                    overflow: cellRadius || cellMaxH ? "hidden" : undefined,
                    ...(cellAspect ? { position: "relative", aspectRatio: cellAspect } : {}),
                    ...(cellMinH ? { minHeight: cellMinH } : {}),
                    ...(cellMaxH ? { maxHeight: cellMaxH } : {}),
                  } : {}),
                }}
              >
                {rendered}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @media (max-width: 1199px) { .${cls} { grid-template-columns: ${layoutSectionTemplate(colsTablet, widths && widths.length === colsTablet ? widths : null)} !important; } }
        @media (max-width: 767px) { .${cls} { grid-template-columns: ${layoutSectionTemplate(colsMobile, widths && widths.length === colsMobile ? widths : null)} !important; gap: ${gapMobile}px !important; } }
      `}</style>
    </div>
  );
}

// ── Renderer ──────────────────────────────────────────────────────────────────
// Container types with their own independent data fetch (not covered by the shared collection/
// single-product preload in LandingContainers' second useEffect) — kept on the old JS-hook-gated
// mount below so an off-device visitor never pays for a request whose result they'll never see.
// Every other type either has zero fetch cost (its content is embedded in the containers JSON) or
// is already fetched unconditionally by the shared preload regardless of device, so switching them
// to always-mounted/CSS-hidden (see landing-vis-* in globals.css) costs nothing extra and removes
// the post-hydration whole-section mount/unmount that was a major CLS contributor.
const FETCH_GATED_CONTAINER_TYPES = new Set([
  "bestseller_carousel",
  "collections_carousel",
  "brands_directory",
  "seller_carousel",
  "blog_carousel",
  "personalized_product_row",
  "page_banner",
  "product_container",
  "page_richtext",
]);

// `opts.isChild` — layout_section slots (docs/SUPPORT-LANDING-STEP1-ARCHITECTURE.md §2.3): a
// child container always renders on whatever device its parent is currently shown on and never
// gets its own independent visible_on device targeting (which otherwise defaults to "desktop" and
// would make every child vanish on mobile unless explicitly overridden). `visible: false` (the
// hard on/off switch, as opposed to device targeting) still applies to children as normal.
function renderContainer(c, preload = {}, ctx = {}, opts = {}) {
  if (c.visible === false) return null;
  const isChild = !!opts.isChild;
  const v = c.visible_on || "desktop";
  // No tablet-specific container was authored for this page — a tablet visitor falls back to
  // whatever mobile shows instead of seeing nothing (see `hasTabletContainer` in LandingContainers).
  const tabletFallsBackToMobile = ctx.isTablet && !ctx.hasTabletContainer;
  const isFetchGated = !isChild && FETCH_GATED_CONTAINER_TYPES.has(c.type);
  if (isFetchGated) {
    if (tabletFallsBackToMobile) {
      if (v !== "mobile" && v !== "both") return null;
    } else if (v === "tablet") {
      // Strict device isolation via JS: mobile (< 600px), tablet (600–1199px), desktop (≥ 1200px)
      if (!ctx.isTablet) return null;
    } else if (v === "desktop") {
      if (ctx.isNarrow || ctx.isTablet) return null;
    } else if (v === "mobile") {
      if (!ctx.isNarrow || ctx.isTablet) return null;
    } else if (v === "both") {
      if (ctx.isTablet) return null;
    }
  }
  // No tablet-specific container exists for this page — extend the mobile/both CSS visibility
  // classes to cover the tablet width range too (see .landing-tablet-fallback in globals.css),
  // instead of leaving that section blank for tablet visitors.
  const tabletFallbackVisible = !ctx.hasTabletContainer && (v === "mobile" || v === "both");
  const visClass = isChild ? "" : isFetchGated
    ? ""
    : v === "tablet" ? "landing-vis-tablet"
    : v === "desktop" ? "landing-vis-desktop"
    : v === "mobile" ? `landing-vis-mobile${tabletFallbackVisible ? " landing-tablet-fallback" : ""}`
    : v === "both" ? `landing-vis-both${tabletFallbackVisible ? " landing-tablet-fallback" : ""}`
    : "";
  const locale = ctx.locale || "de";
  let inner = null;
  const collectionKey = `${String(c.collection_id || "").trim()}|${String(c.collection_handle || "").trim()}`;
  const singleKey = String(c.product_id || c.product_handle || "").trim();
  switch (c.type) {
    case "hero_banner":          inner = <HeroBanner container={c} locale={locale} headingLevel={ctx.firstVisibleId === c.id ? 1 : 2} />; break;
    case "text_block":           inner = <TextBlock container={c} locale={locale} />; break;
    case "video_block":         inner = <VideoBlock container={c} locale={locale} />; break;
    case "image_text":           inner = <ImageText container={c} locale={locale} />; break;
    case "image_grid":           inner = <ImageGrid container={c} locale={locale} />; break;
    case "image_carousel":       inner = <ImageCarousel container={c} locale={locale} isFirstContainer={ctx.firstVisibleId === c.id} />; break;
    case "banner_cta":           inner = <BannerCta container={c} locale={locale} />; break;
    case "collection_carousel":  inner = <CollectionCarousel container={c} locale={locale} preloadedProducts={preload.collectionProducts?.[collectionKey]} />; break;
    case "bestseller_carousel":  inner = <BestsellerCarousel container={c} locale={locale} preloadedProducts={preload.bestsellers?.[bestsellerPreloadKey(c)]} />; break;
    case "brands_directory":     inner = <BrandsDirectoryContainer container={c} locale={locale} />; break;
    // Legacy brands hub seed used seller_carousel for the Marken grid (API never existed).
    case "seller_carousel":      inner = <BrandsDirectoryContainer container={c} locale={locale} />; break;
    case "content_mosaic":       inner = <ContentMosaic container={c} locale={locale} preloadedProducts={preload.collectionProducts?.[collectionKey]} />; break;
    case "collections_carousel": inner = <CollectionsCarousel container={c} locale={locale} />; break;
    case "accordion":            inner = <Accordion container={c} locale={locale} />; break;
    case "tabs":                 inner = <Tabs container={c} locale={locale} />; break;
    case "single_product":       inner = <SingleProduct container={c} locale={locale} preloadedProduct={preload.singleProducts?.[singleKey]} />; break;
    case "blog_carousel":        inner = <BlogCarousel container={c} locale={locale} />; break;
    case "newsletter":           inner = <NewsletterSignup container={c} locale={locale} />; break;
    case "feature_grid":         inner = <FeatureGrid container={c} locale={locale} />; break;
    case "testimonials":              inner = <Testimonials container={c} locale={locale} />; break;
    case "personalized_product_row":  inner = <PersonalizedProductRow container={c} locale={locale} />; break;
    case "layout_section":       inner = <LayoutSection container={c} locale={locale} preload={preload} ctx={ctx} />; break;
    case "page_banner":
      inner = ctx.catalogSlots?.page_banner ?? null;
      if (!inner) return null;
      break;
    case "product_container":
      inner = ctx.catalogSlots?.product_container ?? null;
      if (!inner) return null;
      break;
    case "page_richtext":
      inner = ctx.catalogSlots?.page_richtext ?? null;
      if (!inner) return null;
      break;
    case "support_hero":
    case "support_case_wizard":
    case "support_topic_grid":
    case "support_faq":
    case "support_order_picker":
    case "support_help_cards":
    case "support_help_library":        inner = <SupportLanding type={c.type} container={c} locale={locale} />; break;
    default: return null;
  }
  const m = c.margin || {};
  // The Sellercentral "Outer margin" editor saves a bare number (e.g. "20"), not a CSS length —
  // a unitless value is invalid for margin and the browser silently drops it, so it never showed
  // up on the shop no matter what was typed. Bare numbers get "px" appended here; anything that
  // already carries a unit (e.g. "2rem", "5%") passes through unchanged.
  const marginStyle = {
    ...(m.top    ? { marginTop:    cssLengthOrSelf(m.top) }    : {}),
    ...(m.bottom ? { marginBottom: cssLengthOrSelf(m.bottom) } : {}),
    ...(m.left   ? { marginLeft:   cssLengthOrSelf(m.left) }   : {}),
    ...(m.right  ? { marginRight:  cssLengthOrSelf(m.right) }  : {}),
  };
  const hasMargin = Object.keys(marginStyle).length > 0;
  return <div key={c.id} className={visClass || undefined} style={hasMargin ? marginStyle : undefined}>{inner}</div>;
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * `initialContainers`/`initialSettings` are server-fetched props from the plain homepage route
 * (apps/shop/src/app/[locale]/page.jsx) — every other call site (CMS pages, category templates)
 * doesn't pass them and behaves exactly as before, unaffected.
 */
const EMPTY_PRELOAD = { collectionProducts: {}, singleProducts: {}, bestsellers: {} };

export default function LandingContainers({
  pageId,
  categoryId,
  collectionId,
  initialContainers = null,
  initialSettings = null,
  initialPreload = null,
  applyCatalogDefaults = false,
  catalogSlots = null,
  onSettingsChange = null,
}) {
  const hasProvided = Array.isArray(initialContainers);
  const hasSsrData = hasProvided;
  const applyList = (list, settings) => (
    applyCatalogDefaults
      ? resolveCatalogLandingContainers(Array.isArray(list) ? list : [], settings)
      : (Array.isArray(list) ? list : [])
  );
  const [containers, setContainers] = useState(
    applyCatalogDefaults
      ? resolveCatalogLandingContainers(hasProvided ? initialContainers : [], initialSettings || {})
      : (hasProvided ? initialContainers : null)
  );
  const [landingSettings, setLandingSettings] = useState(
    hasProvided && initialSettings
      ? initialSettings
      : (applyCatalogDefaults ? { show_product_filter_bar: true } : {})
  );
  const [preload, setPreload] = useState(initialPreload || EMPTY_PRELOAD);
  const preloadCovers = useRef(initialPreload ? initialContainers : null);
  const [sidebarCategoryLinks, setSidebarCategoryLinks] = useState([]);
  const { setLandingHeaderFilterBar, setSecondNavDesktopClassic } = useLandingChrome();
  const isNarrow = useIsNarrow(1023);
  const isTablet = useIsTablet();
  const locale = useLocale();

  useEffect(() => {
    // SSR already resolved the plain homepage's containers — mirror exactly what the fetch
    // success/error branches below would have done for the header-chrome context setters, and
    // skip the otherwise-duplicate client fetch entirely.
    if (hasSsrData) {
      const showBar = initialSettings?.show_filter_bar !== false;
      setLandingHeaderFilterBar(showBar);
      setSecondNavDesktopClassic(initialSettings?.second_nav_desktop_classic === true);
      const settings = initialSettings && typeof initialSettings === "object" ? initialSettings : {};
      setContainers(applyList(initialContainers, settings));
      setLandingSettings(settings);
      if (typeof onSettingsChange === "function") onSettingsChange(settings);
      return;
    }
    let endpoint = "/api/store-landing-page";
    if (collectionId) {
      endpoint = `/api/store-landing-page/collection/${encodeURIComponent(collectionId)}`;
    } else if (categoryId) {
      endpoint = `/api/store-landing-page/category/${encodeURIComponent(categoryId)}`;
    } else if (pageId) {
      endpoint = `/api/store-landing-page/${encodeURIComponent(pageId)}`;
    } else if (applyCatalogDefaults) {
      return;
    }
    if (!applyCatalogDefaults) {
      setContainers(null);
      setLandingSettings({});
    }
    fetch(endpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.__error) {
          if (process.env.NODE_ENV === "development") {
            const base = resolveMedusaBaseUrl();
            console.warn(
              `[LandingContainers] ${endpoint} failed: HTTP ${data.status} — ${data.message}. Aktif Medusa: ${base}. ` +
                "Shop ve Seller Central aynı NEXT_PUBLIC_MEDUSA_BACKEND_URL değerine ihtiyaç duyar. " +
                "Localhost’ta shop, NEXT_PUBLIC_MEDUSA_USE_ENV_IN_DEV=true olmadan yalnızca http://localhost:9000 kullanır; bu yüzden kayıt Render’dayken sayfa boş kalabilir."
            );
          }
          setLandingHeaderFilterBar(true);
          setSecondNavDesktopClassic(false);
          const fallbackSettings = applyCatalogDefaults ? { show_product_filter_bar: true } : {};
          setLandingSettings(fallbackSettings);
          if (typeof onSettingsChange === "function") onSettingsChange(fallbackSettings);
          setContainers(applyList([], fallbackSettings));
          return;
        }
        const showBar = data?.settings?.show_filter_bar !== false;
        setLandingHeaderFilterBar(showBar);
        setSecondNavDesktopClassic(data?.settings?.second_nav_desktop_classic === true);
        const settings = data?.settings && typeof data.settings === "object" ? data.settings : {};
        setLandingSettings(settings);
        if (typeof onSettingsChange === "function") onSettingsChange(settings);
        if (data?.preload) {
          preloadCovers.current = data.containers;
          setPreload(data.preload);
        }
        setContainers(applyList(Array.isArray(data?.containers) ? data.containers : [], settings));
      })
      .catch(() => {
        setLandingHeaderFilterBar(true);
        setSecondNavDesktopClassic(false);
        const fallbackSettings = applyCatalogDefaults ? { show_product_filter_bar: true } : {};
        setLandingSettings(fallbackSettings);
        if (typeof onSettingsChange === "function") onSettingsChange(fallbackSettings);
        setContainers(applyList([], fallbackSettings));
      });
  }, [pageId, categoryId, collectionId, hasSsrData, initialContainers, initialSettings, applyCatalogDefaults, setLandingHeaderFilterBar, setSecondNavDesktopClassic]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!Array.isArray(containers) || containers.length === 0) return;
      if (preloadCovers.current === containers) return;

      const collectionTargets = new Map();
      const singleTargets = new Set();
      for (const c of containers) {
        if (c.visible === false) continue;
        if (c.type === "collection_carousel" || (c.type === "content_mosaic" && String(c.source || "images") === "collection")) {
          const key = `${String(c.collection_id || "").trim()}|${String(c.collection_handle || "").trim()}`;
          if (key === "|") continue;
          const needLimit = c.type === "content_mosaic" ? 100 : 20;
          const prev = collectionTargets.get(key);
          if (!prev || needLimit > (prev.limit || 0)) {
            collectionTargets.set(key, { c, limit: needLimit });
          }
        } else if (c.type === "single_product") {
          const idOrHandle = String(c.product_id || c.product_handle || "").trim();
          if (idOrHandle) singleTargets.add(idOrHandle);
        }
      }

      // Fetch collections AND single products in parallel
      const [collectionEntries, singleEntries] = await Promise.all([
        Promise.all(
          [...collectionTargets.entries()].map(async ([key, entry]) => {
            try {
              const c = entry.c;
              const limit = entry.limit || 20;
              const param = c.collection_id
                ? `collection_id=${encodeURIComponent(c.collection_id)}`
                : `collection_handle=${encodeURIComponent(c.collection_handle)}`;
              const d = await cachedJsonFetch(`/api/store-products?${param}&limit=${limit}`, { ttlMs: 15000 });
              return [key, Array.isArray(d?.products) ? d.products : []];
            } catch {
              return [key, []];
            }
          })
        ),
        Promise.all(
          [...singleTargets].map(async (idOrHandle) => {
            try {
              const { product } = await getMedusaClient().getProduct(idOrHandle);
              return [idOrHandle, product || null];
            } catch {
              return [idOrHandle, null];
            }
          })
        ),
      ]);

      if (cancelled) return;
      setPreload({
        collectionProducts: Object.fromEntries(collectionEntries),
        singleProducts: Object.fromEntries(singleEntries),
      });
    };
    run();
    return () => { cancelled = true; };
  }, [containers]);

  // Category sidebar — from "category_sidebar" container and/or landing setting
  // show_product_filter_bar (Sellercentral → Filterleiste → Produkt-Filterleiste anzeigen).
  // Links are auto-derived from this page's bestseller_carousel containers with products.
  const wantProductFilterBar = landingSettings?.show_product_filter_bar === true;
  const hasSidebarContainer = Array.isArray(containers) && containers.some((c) => c?.type === "category_sidebar" && c?.visible !== false);
  const shouldLoadSidebarLinks = Array.isArray(containers) && (hasSidebarContainer || wantProductFilterBar);
  useEffect(() => {
    if (!shouldLoadSidebarLinks) { setSidebarCategoryLinks([]); return; }
    let cancelled = false;
    const seen = new Set();
    const candidates = [];
    for (const c of containers) {
      if (c?.type !== "bestseller_carousel" || c?.visible === false) continue;
      const slug = String(c.category_slug || "").trim();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      candidates.push({ slug, title: (lt(c, "title", locale) || "").trim() || slug });
    }
    if (!candidates.length) { setSidebarCategoryLinks([]); return; }
    Promise.all(
      candidates.map((l) =>
        cachedJsonFetch(`/api/store-products?category=${encodeURIComponent(l.slug)}&limit=1`, { ttlMs: 15000 })
          .then((d) => ({ ...l, hasProducts: Array.isArray(d?.products) && d.products.length > 0 }))
          .catch(() => ({ ...l, hasProducts: false }))
      )
    ).then((withCounts) => {
      if (!cancelled) setSidebarCategoryLinks(withCounts.filter((l) => l.hasProducts));
    });
    return () => { cancelled = true; };
  }, [shouldLoadSidebarLinks, containers, locale]);

  // Don't block render — show layout immediately, data-dependent components show skeleton.
  // While containers haven't arrived yet (non-SSR call sites), reserve above-the-fold height
  // instead of rendering nothing, so the page doesn't pop from 0 → full height (CLS).
  if (!containers) return <div className="landing-skeleton" />;
  if (containers.length === 0) return null;

  // Sellers often only ever fill in desktop + mobile — if no container was ever scoped to
  // "tablet", a tablet visitor should see the mobile design rather than an empty section.
  const hasTabletContainer = containers.some((c) => c && c.visible !== false && (c.visible_on || "desktop") === "tablet");
  const tabletFallsBackToMobile = isTablet && !hasTabletContainer;

  const deviceContainers = containers.filter((c) => {
    if (!c || c.visible === false) return false;
    const v = c.visible_on || "desktop";
    if (tabletFallsBackToMobile) return v === "mobile" || v === "both";
    if (v === "tablet") return isTablet;
    if (v === "desktop") return !isNarrow && !isTablet;
    if (v === "mobile") return isNarrow && !isTablet;
    if (v === "both") return !isTablet;
    return true;
  });

  const layoutFlag = String(landingSettings?.become_seller_layout || "");
  const layoutVersion = Number((layoutFlag.match(/^become_seller_v(\d+)/i) || [])[1] || 0);
  // Visual template (stats strip, accordions, mosaic) from v3+; older layouts stay generic until reseeded.
  if (layoutVersion >= 3) {
    return <BecomeSellerLanding containers={deviceContainers} />;
  }

  // First container that will actually render on the current device (for header gradient)
  const firstVisibleId = (() => {
    for (const c of containers) {
      if (c.visible === false) continue;
      const v = c.visible_on || "desktop";
      if (tabletFallsBackToMobile) {
        if (v === "mobile" || v === "both") return c.id;
        continue;
      }
      if (v === "tablet" && isTablet) return c.id;
      if (v === "desktop" && !isNarrow && !isTablet) return c.id;
      if (v === "mobile" && isNarrow && !isTablet) return c.id;
      if (v === "both" && !isTablet) return c.id;
    }
    return null;
  })();

  const mainContainers = containers.filter((c) => c.type !== "category_sidebar");
  const stack = (
    <div>
      {mainContainers.map((c) => renderContainer(c, preload, { isNarrow, isTablet, hasTabletContainer, locale, firstVisibleId, catalogSlots }))}
    </div>
  );

  const showSidebar = shouldLoadSidebarLinks && sidebarCategoryLinks.length > 0;
  if (!showSidebar) return stack;

  const saleSlugs = new Set();
  for (const c of containers || []) {
    if (c?.type === "bestseller_carousel" && c?.visible !== false && c?.mode === "sale") {
      const s = String(c.category_slug || "").trim();
      if (s) saleSlugs.add(s);
    }
  }
  const links = sidebarCategoryLinks.map((l) => {
    const slug = String(l.slug).replace(/^\//, "");
    return {
      slug,
      title: l.title,
      href: saleSlugs.has(l.slug) || saleSlugs.has(slug) ? `/${slug}` : `/${slug}?sort=bestseller`,
    };
  });

  return (
    <CatalogHubFilterShell links={links} locale={locale}>
      {stack}
    </CatalogHubFilterShell>
  );
}
