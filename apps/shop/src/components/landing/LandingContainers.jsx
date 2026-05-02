"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { getMedusaClient, resolveMedusaBaseUrl } from "@/lib/medusa-client";
import { useLandingChrome } from "@/context/LandingChromeContext";
import Carousel from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { useIsNarrow, useIsTablet } from "@/hooks/useIsNarrow";
import { useLocale } from "next-intl";

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
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return `${BACKEND_URL}/uploads/${url}`;
}

function parsePaddingParts(val) {
  const parts = (val || "0px").trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
}

// Inner padding from container.padding only. External gaps between containers use margin on the wrapper.
function getContainerPadding(container, defaultPad) {
  const [t, r, b, l] = parsePaddingParts(container.padding || defaultPad || "0px");
  return { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l };
}

/** Innere Zeile: volle Breite innerhalb des Container-Paddings oder zentriert mit max-width (pro Block typischer Fallback in px). */
function normalizeContentMaxWidth(val, fallbackPx) {
  const n = Number(fallbackPx);
  const fb = `${Number.isFinite(n) && n > 0 ? n : 1200}px`;
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
        aria-label={ariaLabel || titleStr || "Karussell"}
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

// Resolve alignSelf for a button based on justifyContent
function btnAlignSelf(justifyContent) {
  if (justifyContent === "flex-start") return "flex-start";
  if (justifyContent === "flex-end") return "flex-end";
  return "center";
}

// ── Hero Banner Slider ────────────────────────────────────────────────────────
function HeroBanner({ container, locale = "de" }) {
  const isMobile = useIsNarrow(767);
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const scrollRef = useRef(null);
  const userScrolling = useRef(false);

  const slides = (container.slides || []).filter((s) => localizedAsset(s, "image", locale));
  const height = container.height || "500px";
  const mobileHeight = container.mobile_height || "200px";
  const mobilePadding = container.mobile_padding || "0px";
  const mobileRadius = container.mobile_radius ? `${container.mobile_radius}px` : "0px";

  // ── Auto-advance ──────────────────────────────────────────────────────────
  const scheduleNext = useCallback(() => {
    clearTimeout(timerRef.current);
    if (container.autoplay !== false && slides.length > 1) {
      timerRef.current = setTimeout(() => setCurrent((c) => (c + 1) % slides.length), container.delay || 4000);
    }
  }, [slides.length, container.autoplay, container.delay]);

  useEffect(() => {
    scheduleNext();
    return () => clearTimeout(timerRef.current);
  }, [current, scheduleNext]);

  // ── Sync scroll to current (programmatic navigation) ─────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isMobile || userScrolling.current) return;
    el.scrollTo({ left: current * el.offsetWidth, behavior: "smooth" });
  }, [current, isMobile]);

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
    if (el && isMobile) el.scrollTo({ left: idx * el.offsetWidth, behavior: "smooth" });
    scheduleNext();
  }, [scheduleNext, isMobile]);

  if (slides.length === 0) return null;

  // ── Shared slide text overlay ─────────────────────────────────────────────
  function Overlay({ s, mobile }) {
    const title = lt(s, "title", locale);
    const subtitle = lt(s, "subtitle", locale);
    const btnText = lt(s, "btn_text", locale);
    if (!title && !subtitle && !btnText) return null;
    const ps = getPositionStyle(s.text_position || "center");
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: mobile ? "14px" : (s.content_padding || "32px 48px"), pointerEvents: "none", ...ps }}>
        {title && <h2 style={{ fontSize: mobile ? "clamp(14px,5vw,26px)" : (s.title_size || "clamp(24px,4vw,56px)"), fontWeight: 900, color: s.text_color || "#fff", margin: 0, lineHeight: 1.15, marginBottom: subtitle ? 6 : (btnText ? 10 : 0) }}>{title}</h2>}
        {subtitle && <p style={{ fontSize: mobile ? "clamp(11px,3vw,15px)" : (s.subtitle_size || "clamp(14px,2vw,22px)"), color: s.subtitle_color || s.text_color || "#fff", margin: btnText ? "0 0 10px" : 0, maxWidth: 600 }}>{subtitle}</p>}
        {btnText && <a href={s.btn_url || "#"} style={{ pointerEvents: "auto", display: "inline-block", padding: mobile ? "7px 16px" : (s.btn_padding || "12px 28px"), background: s.btn_bg || "#ff971c", color: s.btn_color || "#fff", border: s.btn_border || "2px solid #000", borderRadius: s.btn_radius || 8, fontWeight: 800, fontSize: mobile ? 12 : 15, textDecoration: "none", boxShadow: "0 3px 0 2px #000", alignSelf: btnAlignSelf(ps.justifyContent) }}>{btnText}</a>}
      </div>
    );
  }

  // ── Dots ──────────────────────────────────────────────────────────────────
  function Dots({ mobile }) {
    if (slides.length <= 1) return null;
    return (
      <div style={{ position: "absolute", bottom: mobile ? 8 : 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: mobile ? 5 : 8, zIndex: 5, pointerEvents: "auto" }}>
        {slides.map((_, i) => (
          <button key={i} type="button" onClick={() => goTo(i)} aria-label={`Slide ${i + 1}`} aria-current={i === current ? "true" : undefined}
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
                  <img src={resolveUrl(lt(s, "image", locale))} alt={s.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" }} draggable="false" />
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
            const imgEl = <img src={resolveUrl(lt(s, "image", locale))} alt={s.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
            const wrapStyle = { position: "absolute", inset: 0, opacity: i === current ? 1 : 0, transition: "opacity 0.7s ease", pointerEvents: i === current ? "auto" : "none" };
            return s.btn_url
              ? <a key={i} href={s.btn_url} style={{ ...wrapStyle, display: "block" }}>{imgEl}</a>
              : <div key={i} style={wrapStyle}>{imgEl}</div>;
          })}
          <Overlay s={slide} mobile={false} />
          <Dots mobile={false} />
          {slides.length > 1 && (
            <>
              <button type="button" aria-label="Vorherige Folie" onClick={() => goTo((current - 1 + slides.length) % slides.length)} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>‹</button>
              <button type="button" aria-label="Nächste Folie" onClick={() => goTo((current + 1) % slides.length)} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>›</button>
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
    <div style={{ background: container.bg_color || "#fff", ...getContainerPadding(container, "48px 24px") }}>
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
  const bg = container.bg_color || "#fff";
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
  const imageLeft = container.image_side !== "right";
  const imgSrc = resolveUrl(lt(container, "image", locale));
  const textAlign = container.text_align || "left";
  const title = lt(container, "title", locale);
  const body = lt(container, "body", locale);
  const btnText = lt(container, "btn_text", locale);
  return (
    <div style={{ background: container.bg_color || "#fff", ...getContainerPadding(container, "48px 24px") }}>
      <div style={{ ...getContentInnerStyle(container, 1100), display: "flex", flexDirection: imageLeft ? "row" : "row-reverse", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
        {imgSrc && (
          <div style={{ flex: "0 0 auto", width: "min(45%, 480px)" }}>
            <img src={imgSrc} alt={title || ""} style={{ width: "100%", borderRadius: 12, display: "block", border: "2px solid #000", boxShadow: "0 4px 0 2px #000" }} />
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
  const isNarrow = useIsNarrow(1023);
  const source = String(container.source || "images");
  const baseGap = container.gap != null ? Number(container.gap) : 16;
  const gapMobile = container.gap_mobile != null ? Number(container.gap_mobile) : null;
  const gap = isNarrow && gapMobile != null && !Number.isNaN(gapMobile) ? gapMobile : (Number.isNaN(baseGap) ? 16 : baseGap);
  const patD = parseMosaicLayoutPattern(container.layout_pattern_desktop, [1, 2]);
  const patM = parseMosaicLayoutPattern(container.layout_pattern_mobile, [1]);
  const pattern = isNarrow ? patM : patD;
  const ratio = normalizeCollectionsCarouselAspectRatio(container.card_aspect_ratio);
  const imgObjectFit = container.card_image_object_fit === "contain" ? "contain" : "cover";
  const bg = container.bg_color || "#fff";

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
    fetch(`/api/store-products?${param}&limit=100`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d?.products) ? d.products : []))
      .catch(() => setProducts([]));
  }, [source, container.collection_id, container.collection_handle, preloadedProducts]);

  useEffect(() => {
    if (source !== "collections" || !snapshots.length) return;
    fetch("/api/store-collections", { cache: "no-store" })
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
        <div style={getContentInnerStyle(container, 1280)}>
          <div style={{ display: "flex", flexDirection: "column", gap, width: "100%" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: i === 1 ? "1fr" : "1fr 1fr", gap, width: "100%" }}>
                {Array.from({ length: i === 1 ? 1 : 2 }).map((_, j) => (
                  <div key={j} style={{ minHeight: 200, borderRadius: 10, background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)", backgroundSize: "800px 100%", animation: "shimmer 1.5s infinite linear" }} />
                ))}
              </div>
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
        <img src={src} alt={imgTitle || ""} style={{ width: "100%", aspectRatio: r, objectFit: "cover", borderRadius: 10, display: "block", border: "1px solid #e5e7eb" }} />
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
          <img src={image} alt={c.title || ""} style={{ width: "100%", height: "100%", objectFit: imgObjectFit, display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>Keine Vorschau</div>
        )}
        <div style={{ position: "absolute", inset: "auto 0 0 0", padding: "12px 14px", background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)", color: "#fff" }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{c.title || c.handle || `Kollektion ${i + 1}`}</div>
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

  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: bg }}>
      <div style={getContentInnerStyle(container, 1280)}>
        {lt(container, "title", locale) && (
          <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.5rem)", fontWeight: 700, color: "#111827", margin: "0 0 20px" }}>{lt(container, "title", locale)}</h2>
        )}
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
                if (source === "images") {
                  return (
                    <div
                      key={k}
                      style={{ minWidth: 0, boxSizing: "border-box", ...getImageCellPaddingStyle(it) }}
                    >
                      {renderImage(it)}
                    </div>
                  );
                }
                if (source === "collection") return renderProduct(it, k, mosaicGridCellIndex(rows, ri, ci));
                return renderCollectionCard(it, ri * 10 + ci, k);
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Image Grid ────────────────────────────────────────────────────────────────
function ImageGrid({ container, locale = "de" }) {
  const cols = container.cols || 2;
  const gap = container.gap || 16;
  const images = (container.images || []).filter((i) => localizedAsset(i, "url", locale));
  if (!images.length) return null;
  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
      <div style={{ ...getContentInnerStyle(container, 1100), display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
        {images.map((img, i) => {
          const ratio = img.aspect_ratio || "1/1";
          const imgTitle = lt(img, "title", locale);
          const imgText = lt(img, "text", locale);
          const imgEl = <img src={resolveUrl(lt(img, "url", locale))} alt={imgTitle || ""} style={{ width: "100%", aspectRatio: ratio, objectFit: "cover", borderRadius: 10, display: "block", border: "1px solid #e5e7eb" }} />;
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
            ? <a key={i} href={img.link} style={{ display: "block", textDecoration: "none" }}>{inner}</a>
            : <div key={i}>{inner}</div>;
        })}
      </div>
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
    </div>
  );
}

// ── Collection Carousel ───────────────────────────────────────────────────────
function CollectionCarousel({ container, preloadedProducts, locale = "de" }) {
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
    fetch(`/api/store-products?${param}&limit=20`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d?.products) ? d.products : []))
      .catch(() => setProducts([]));
  }, [container.collection_id, container.collection_handle, preloadedProducts]);

  // Still loading → show skeleton placeholder row
  if (products === undefined) {
    return (
      <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
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
      <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
        <div style={getContentInnerStyle(container, 1280)}>
          <MobilePagedGridScroll
            title={lt(container, "title", locale)}
            gap={gap}
            rows={rows}
            cols={cols}
            items={products}
            itemKey={(p, i) => p.id || i}
            renderItem={renderProductWithCaption}
            ariaLabel={lt(container, "title", locale) || "Kollektion: Produkte"}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
      <div style={getContentInnerStyle(container, 1280)}>
        <Carousel
          contained={false}
          title={lt(container, "title", locale) || undefined}
          visibleCount={itemsPerRow}
          navOnSides
          gap={gap}
          showFade={false}
          ariaLabel={lt(container, "title", locale) || "Collection carousel"}
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

function CollectionsCarousel({ container, locale = "de" }) {
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

  // Fetch live collection data so title/image changes in admin are reflected immediately.
  const [liveCollections, setLiveCollections] = useState(null);

  useEffect(() => {
    if (!snapshots.length) return;
    fetch("/api/store-collections", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const all = Array.isArray(data?.collections) ? data.collections : [];
        if (!all.length) return;
        const byId = new Map(all.map((c) => [c.id, c]));
        const merged = snapshots.map((snap) => {
          const live = byId.get(snap.id);
          if (!live) return snap;
          const fromMain = collectionCarouselCardImageFromLive(live);
          return {
            ...snap,
            title: live.display_title || live.title || snap.title,
            handle: live.handle || snap.handle,
            image: fromMain || "",
          };
        });
        setLiveCollections(merged);
      })
      .catch(() => {});
  }, [container.id]);

  const collections = liveCollections ?? snapshots;

  if (!collections.length) return null;

  const { isGrid, rows, cols } = resolveMobilePagedGrid(container);
  if (isNarrow && isGrid) {
    const renderCollectionCell = (collection, i) => {
      const href = collectionHref(collection.handle);
      const image = resolveUrl(collection.image);
      const card = (
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
            <img
              src={image}
              alt={collection.title || ""}
              style={{ width: "100%", height: "100%", objectFit: imgObjectFit, display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
              Keine Vorschau
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
              {collection.title || collection.handle || `Kollektion ${i + 1}`}
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
      <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
        <div style={getContentInnerStyle(container, 1280)}>
          <MobilePagedGridScroll
            title={lt(container, "title", locale)}
            gap={gap}
            rows={rows}
            cols={cols}
            items={collections}
            itemKey={(c, i) => c.id || i}
            renderItem={renderCollectionCell}
            ariaLabel={lt(container, "title", locale) || "Kollektionen"}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
      <div style={getContentInnerStyle(container, 1280)}>
        <Carousel
          contained={false}
          title={lt(container, "title", locale) || undefined}
          visibleCount={itemsPerRow}
          navOnSides
          gap={gap}
          ariaLabel={lt(container, "title", locale) || "Collections carousel"}
        >
          {collections.map((collection, i) => {
            const href = collectionHref(collection.handle);
            const image = resolveUrl(collection.image);
            const card = (
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
                  <img
                    src={image}
                    alt={collection.title || ""}
                    style={{ width: "100%", height: "100%", objectFit: imgObjectFit, display: "block" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
                    Keine Vorschau
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
                    {collection.title || collection.handle || `Kollektion ${i + 1}`}
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
      <div style={{ ...getContainerPadding(container, "48px 24px"), background: container.bg_color || "#fff" }}>
        <div style={{ maxWidth: 420, margin: "0 auto", height: 360, borderRadius: 12, background: "linear-gradient(90deg,#efefed 25%,#e5e5e3 50%,#efefed 75%)", backgroundSize: "800px 100%", animation: "shimmer 1.5s infinite linear" }} />
      </div>
    );
  }
  if (!product) return null;

  const wrapBg = container.bg_color || "#fff";
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
  const posts = Array.isArray(container.posts)
    ? container.posts.filter((p) => p && (p.title || p.image || p.excerpt || p.body))
    : [];
  const desktopN = container.items_per_row != null ? Number(container.items_per_row) : 3;
  const mobileN = container.items_per_row_mobile != null ? Number(container.items_per_row_mobile) : 1;
  const itemsPerRow = useResponsiveColumnCount(desktopN, mobileN);
  const gap = 16;

  if (!posts.length) return null;

  const bg = container.bg_color || "#fff";
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
      <div style={getContentInnerStyle(container, 1280)}>
        <Carousel
          contained={false}
          title={lt(container, "title", locale) || undefined}
          visibleCount={Math.min(itemsPerRow, posts.length)}
          navOnSides
          gap={gap}
          fadeBgColor={bg}
          ariaLabel={lt(container, "title", locale) || "Blog"}
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
                <div style={{ aspectRatio: "16/10", overflow: "hidden", background: "#eee" }}>
                  <img src={img} alt={post.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
  const action = (container.form_action || "").trim();
  const method = (container.form_method || "post").toLowerCase() === "get" ? "get" : "post";
  const emailName = (container.email_field_name || "EMAIL").trim() || "EMAIL";
  const hiddenFields = Array.isArray(container.hidden_fields) ? container.hidden_fields : [];
  const bg = container.bg_color || "#f3f4f6";
  const textColor = container.text_color || "#111827";
  const btnBg = container.btn_bg || "#111827";
  const btnColor = container.btn_color || "#fff";
  const [internalEmail, setInternalEmail] = React.useState("");
  const [internalState, setInternalState] = React.useState("idle"); // idle | loading | success | error

  const handleInternalSubmit = async (e) => {
    e.preventDefault();
    if (!internalEmail || !internalEmail.includes("@")) return;
    setInternalState("loading");
    try {
      const backendUrl = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000");
      const r = await fetch(`${backendUrl}/store/newsletter-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: internalEmail.trim().toLowerCase() }),
      });
      if (!r.ok) throw new Error("error");
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
            <input type="email" name={emailName} required placeholder={lt(container, "email_placeholder", locale) || "E-Mail"} autoComplete="email" style={sharedInputStyle} />
            <button type="submit" style={sharedBtnStyle}>{lt(container, "button_text", locale) || "Abonnieren"}</button>
          </form>
        ) : internalState === "success" ? (
          <p style={{ fontSize: 16, color: "#059669", fontWeight: 600, margin: "12px 0 0" }}>
            {container.success_text || "Danke! Sie sind jetzt angemeldet."}
          </p>
        ) : (
          <form onSubmit={handleInternalSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
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
              <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>Fehler beim Anmelden. Bitte erneut versuchen.</p>
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
  const [activeIdx, setActiveIdx] = useState(0);
  const tabs = container.tabs || [];
  const bg = container.bg_color || "#ffffff";
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
          <div role="tablist" aria-label="Inhalt" style={barWrap}>
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
    cols = 3, card_style = "bordered",
    icon_size = "40px",
    bg_color = "#ffffff", card_bg = "#f9fafb",
    card_border_color = "#e5e7eb", text_color = "#111827",
    items = [],
  } = container;
  const title = lt(container, "title", locale);
  const subtitle = lt(container, "subtitle", locale);

  const cardStyle = (() => {
    const base = {
      background: card_bg,
      color: text_color,
      padding: "28px 24px",
      borderRadius: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    };
    if (card_style === "bordered") return { ...base, border: `1px solid ${card_border_color}` };
    if (card_style === "shadow") return { ...base, boxShadow: "0 4px 24px -6px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.06)" };
    return base; // flat
  })();

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
          className="landing-feature-grid"
        >
          {items.map((item, i) => (
            <div key={i} style={cardStyle}>
              {item.icon && (
                <div style={{ fontSize: icon_size, lineHeight: 1 }}>{item.icon}</div>
              )}
              {lt(item, "title", locale) && (
                <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: text_color, margin: 0 }}>{lt(item, "title", locale)}</div>
              )}
              {lt(item, "body", locale) && (
                <div style={{ fontSize: "0.9375rem", color: text_color, opacity: 0.72, lineHeight: 1.6, margin: 0 }}>{lt(item, "body", locale)}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:767px){.landing-feature-grid{grid-template-columns:1fr!important;}}@media(min-width:768px) and (max-width:1023px){.landing-feature-grid{grid-template-columns:repeat(2,1fr)!important;}}`}</style>
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
  const desktopN = container.items_per_row != null ? Number(container.items_per_row) : 4;
  const mobileN = container.items_per_row_mobile != null ? Number(container.items_per_row_mobile) : 2;
  const itemsPerRow = useResponsiveColumnCount(desktopN, mobileN);
  const isNarrow = useIsNarrow(1023);
  const images = (container.images || []).filter((i) => localizedAsset(i, "url", locale));
  const { setLandingHeaderBg } = useLandingChrome();
  const mobileScrollRef = useRef(null);
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
      setLandingHeaderBg(`linear-gradient(${dir}, ${img.color} 0%, transparent ${stop})`);
    } else {
      setLandingHeaderBg(null);
    }
  }, [activeIdx, isFirstContainer, images, setLandingHeaderBg]);

  // Clear gradient on unmount
  useEffect(() => {
    return () => setLandingHeaderBg(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!images.length) return null;
  const baseGap = container.gap != null ? Number(container.gap) : 16;
  const gapMobile = container.gap_mobile != null ? Number(container.gap_mobile) : null;
  const gap = isNarrow && gapMobile != null && !Number.isNaN(gapMobile) ? gapMobile : (Number.isNaN(baseGap) ? 16 : baseGap);
  const bg = container.bg_color || "#fff";
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

  const renderImageCell = (img) => {
    const src = resolveUrl(lt(img, "url", locale));
    const ratio = pickImageCarouselRatio(container, isNarrow);
    const minH = isNarrow && (container.min_height_mobile != null) && String(container.min_height_mobile).trim() !== "";
    const maxH = isNarrow ? (maxHMobile || maxHDesktop) : maxHDesktop;
    const boxStyle = {
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
          <img src={src} alt={imgTitle || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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

  if (isNarrow && isGrid) {
    return (
      <div style={{ ...carouselPadding, background: bg }}>
        <div style={getContentInnerStyle(container, 1280)}>
          <MobilePagedGridScroll
            title={lt(container, "title", locale)}
            gap={gap}
            rows={rows}
            cols={cols}
            items={images}
            itemKey={(_, i) => `img-${i}`}
            renderItem={renderImageCell}
            ariaLabel={lt(container, "title", locale) || "Bild-Karussell"}
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
                {renderImageCell(img)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...carouselPadding, background: bg }}>
      <div style={getContentInnerStyle(container, 1280)}>
        <Carousel
          contained={false}
          title={lt(container, "title", locale) || undefined}
          visibleCount={itemsPerRow}
          navOnSides
          gap={gap}
          ariaLabel={lt(container, "title", locale) || "Bild-Karussell"}
        >
          {images.map((img, i) => (
            <div key={i} style={{ minWidth: 0 }}>
              {renderImageCell(img)}
            </div>
          ))}
        </Carousel>
      </div>
    </div>
  );
}

// ── Renderer ──────────────────────────────────────────────────────────────────
function renderContainer(c, preload = {}, ctx = {}) {
  if (!c.visible) return null;
  const v = c.visible_on || "desktop";
  // Strict device isolation: each container only renders on its designated device range.
  // mobile (< 600px), tablet (600–1199px), desktop (≥ 1200px)
  if (v === "tablet") {
    if (!ctx.isTablet) return null;
  } else if (v === "desktop") {
    if (ctx.isNarrow || ctx.isTablet) return null;
  } else if (v === "mobile") {
    // Show only on true mobile (isNarrow but NOT tablet, i.e. < 600px)
    if (!ctx.isNarrow || ctx.isTablet) return null;
  } else if (v === "both") {
    // Legacy "both": desktop + mobile, never tablet
    if (ctx.isTablet) return null;
  }
  const locale = ctx.locale || "de";
  let inner = null;
  const collectionKey = `${String(c.collection_id || "").trim()}|${String(c.collection_handle || "").trim()}`;
  const singleKey = String(c.product_id || c.product_handle || "").trim();
  switch (c.type) {
    case "hero_banner":          inner = <HeroBanner container={c} locale={locale} />; break;
    case "text_block":           inner = <TextBlock container={c} locale={locale} />; break;
    case "video_block":         inner = <VideoBlock container={c} locale={locale} />; break;
    case "image_text":           inner = <ImageText container={c} locale={locale} />; break;
    case "image_grid":           inner = <ImageGrid container={c} locale={locale} />; break;
    case "image_carousel":       inner = <ImageCarousel container={c} locale={locale} isFirstContainer={ctx.firstVisibleId === c.id} />; break;
    case "banner_cta":           inner = <BannerCta container={c} locale={locale} />; break;
    case "collection_carousel":  inner = <CollectionCarousel container={c} locale={locale} preloadedProducts={preload.collectionProducts?.[collectionKey]} />; break;
    case "content_mosaic":       inner = <ContentMosaic container={c} locale={locale} preloadedProducts={preload.collectionProducts?.[collectionKey]} />; break;
    case "collections_carousel": inner = <CollectionsCarousel container={c} locale={locale} />; break;
    case "accordion":            inner = <Accordion container={c} locale={locale} />; break;
    case "tabs":                 inner = <Tabs container={c} locale={locale} />; break;
    case "single_product":       inner = <SingleProduct container={c} locale={locale} preloadedProduct={preload.singleProducts?.[singleKey]} />; break;
    case "blog_carousel":        inner = <BlogCarousel container={c} locale={locale} />; break;
    case "newsletter":           inner = <NewsletterSignup container={c} locale={locale} />; break;
    case "feature_grid":         inner = <FeatureGrid container={c} locale={locale} />; break;
    case "testimonials":         inner = <Testimonials container={c} locale={locale} />; break;
    default: return null;
  }
  const m = c.margin || {};
  const marginStyle = {
    ...(m.top    ? { marginTop:    m.top }    : {}),
    ...(m.bottom ? { marginBottom: m.bottom } : {}),
    ...(m.left   ? { marginLeft:   m.left }   : {}),
    ...(m.right  ? { marginRight:  m.right }  : {}),
  };
  const hasMargin = Object.keys(marginStyle).length > 0;
  return <div key={c.id} style={hasMargin ? marginStyle : undefined}>{inner}</div>;
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function LandingContainers({ pageId, categoryId }) {
  const [containers, setContainers] = useState(null);
  const [preload, setPreload] = useState({ collectionProducts: {}, singleProducts: {} });
  const { setLandingHeaderFilterBar, setSecondNavDesktopClassic } = useLandingChrome();
  const isNarrow = useIsNarrow(1023);
  const isTablet = useIsTablet();
  const locale = useLocale();

  useEffect(() => {
    let endpoint = "/store/landing-page";
    if (categoryId) {
      endpoint = `/store/landing-page/category/${encodeURIComponent(categoryId)}`;
    } else if (pageId) {
      endpoint = `/store/landing-page/${encodeURIComponent(pageId)}`;
    }
    setContainers(null);
    getMedusaClient()
      .request(endpoint, { cache: "no-store" })
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
          setContainers([]);
          return;
        }
        const showBar = data?.settings?.show_filter_bar !== false;
        setLandingHeaderFilterBar(showBar);
        setSecondNavDesktopClassic(data?.settings?.second_nav_desktop_classic === true);
        if (Array.isArray(data?.containers)) setContainers(data.containers);
        else setContainers([]);
      })
      .catch(() => {
        setLandingHeaderFilterBar(true);
        setSecondNavDesktopClassic(false);
        setContainers([]);
      });
  }, [pageId, categoryId, setLandingHeaderFilterBar, setSecondNavDesktopClassic]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!Array.isArray(containers) || containers.length === 0) return;

      const collectionTargets = new Map();
      const singleTargets = new Set();
      for (const c of containers) {
        if (!c?.visible) continue;
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
              const d = await fetch(`/api/store-products?${param}&limit=${limit}`, { cache: "no-store" }).then((r) => r.json());
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

  // Don't block render — show layout immediately, data-dependent components show skeleton
  if (!containers) return null;
  if (containers.length === 0) return null;

  // First container that will actually render on the current device (for header gradient)
  const firstVisibleId = (() => {
    for (const c of containers) {
      if (!c.visible) continue;
      const v = c.visible_on || "desktop";
      if (v === "tablet" && isTablet) return c.id;
      if (v === "desktop" && !isNarrow && !isTablet) return c.id;
      if (v === "mobile" && isNarrow && !isTablet) return c.id;
      if (v === "both" && !isTablet) return c.id;
    }
    return null;
  })();

  return (
    <div>
      {containers.map((c) => renderContainer(c, preload, { isNarrow, isTablet, locale, firstVisibleId }))}
    </div>
  );
}
