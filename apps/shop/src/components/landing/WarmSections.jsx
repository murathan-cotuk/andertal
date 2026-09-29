"use client";

/**
 * Landing containers of the "Warmer Marktplatz" design:
 *  - promo_bento: large campaign tile + two side tiles (Sale / Neuheiten)
 *  - category_circles: round category tiles ("Beliebte Kategorien")
 *  - TrustBarIcon: line icons for feature_grid's "trust_bar" variant
 * All copy, images, colors and links come from the container JSON (Sellercentral → Landing page).
 */

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { resolveImageUrl } from "@/lib/image-url";
import { getLocalizedCategory } from "@/lib/format";
import { shallowCategoriesQuery } from "@/lib/store-categories-url";
import { cachedJsonFetch } from "@/lib/browser-fetch-cache";

const INK = "#1D1B18";
const MUTED = "#5E574E";
const TONES = ["#F1D9C4", "#DCE3D6", "#E4DCE8", "#F3E3C6", "#D8E0E8", "#EADFCF", "#E8D2BC", "#C9D6C0"];

function lt(obj, field, locale) {
  if (!locale || locale === "de") return obj?.[field] ?? "";
  return obj?._i18n?.[locale]?.[field] ?? obj?.[field] ?? "";
}

function img(url) {
  const u = String(url || "").trim();
  return u ? resolveImageUrl(u) : "";
}

/** Internal paths go through the locale-aware Link; absolute URLs stay plain anchors. */
function SmartLink({ href, children, ...rest }) {
  const h = String(href || "").trim() || "#";
  if (/^(https?:)?\/\//i.test(h) || h.startsWith("mailto:") || h.startsWith("#")) {
    return <a href={h} {...rest}>{children}</a>;
  }
  return <Link href={h.startsWith("/") ? h : `/${h}`} {...rest}>{children}</Link>;
}

export const WarmSection = styled.section`
  width: 100%;
  max-width: 1360px;
  margin: 0 auto;
  padding: ${(p) => p.$pad || "56px 24px 0"};
  box-sizing: border-box;
  @media (max-width: 767px) {
    padding: ${(p) => p.$padMobile || "24px 16px 0"};
  }
`;

export const WarmSectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  h2 {
    margin: 0;
    font-family: var(--h2-ff, inherit);
    font-size: clamp(1.5rem, 2.6vw, 2.125rem);
    font-weight: 800;
    letter-spacing: -0.5px;
    line-height: 1.1;
    color: var(--body-color, ${INK});
  }
  a {
    flex-shrink: 0;
    font-weight: 600;
    color: var(--shop-accent, #a65300);
    text-decoration: none;
    white-space: nowrap;
  }
  a:hover {
    text-decoration: underline;
  }
  @media (max-width: 767px) {
    margin-bottom: 16px;
  }
`;

/* ── Promo bento ─────────────────────────────────────────────────────────── */

const Bento = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  min-height: 460px;
  @media (max-width: 1023px) {
    grid-template-columns: 1fr;
    min-height: 0;
  }
`;

const BentoMain = styled.div`
  grid-column: span 2;
  position: relative;
  border-radius: 28px;
  padding: 56px;
  display: flex;
  gap: 32px;
  overflow: hidden;
  @media (max-width: 1023px) {
    grid-column: auto;
    padding: 28px 24px;
    border-radius: 24px;
  }
`;

const BentoCopy = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 24px;
  width: min(470px, 100%);
  flex-shrink: 0;
  .bento-badge {
    align-self: flex-start;
    background: #fff;
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    color: var(--shop-accent, #a65300);
  }
  h1, h2 {
    margin: 0;
    font-family: var(--h1-ff, inherit);
    font-size: clamp(2.1rem, 4.2vw, 3.75rem);
    line-height: 1.02;
    font-weight: 800;
    letter-spacing: -1.5px;
  }
  p {
    margin: 0;
    font-size: 18px;
    line-height: 1.55;
    color: ${MUTED};
  }
  .bento-ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .bento-cta {
    height: 52px;
    padding: 0 28px;
    border-radius: 26px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    text-decoration: none;
    transition: transform 0.15s ease, opacity 0.15s ease;
  }
  .bento-cta:hover {
    transform: translateY(-1px);
  }
  .bento-cta--solid {
    background: ${INK};
    color: #fff;
  }
  .bento-cta--outline {
    border: 2px solid ${INK};
    color: ${INK};
  }
  @media (max-width: 767px) {
    gap: 16px;
    p {
      font-size: 15px;
    }
    .bento-cta {
      height: 46px;
      padding: 0 20px;
    }
  }
`;

const BentoCollage = styled.div`
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  transform: rotate(-4deg);
  margin: -20px -40px -20px 0;
  > * {
    position: relative;
    border-radius: 20px;
    overflow: hidden;
    min-height: 150px;
  }
  > *:nth-child(2) {
    margin-top: 40px;
  }
  > *:nth-child(3) {
    margin-bottom: 40px;
  }
  @media (max-width: 1023px) {
    display: none;
  }
`;

const BentoSide = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  @media (max-width: 1023px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
`;

const BentoTile = styled(SmartLink)`
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  text-decoration: none;
  min-height: 190px;
  transition: transform 0.18s ease;
  &:hover {
    transform: translateY(-2px);
  }
  .tile-eyebrow {
    position: relative;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .tile-title {
    position: relative;
    font-family: var(--h2-ff, inherit);
    font-size: clamp(1.5rem, 2.6vw, 2.5rem);
    font-weight: 800;
    line-height: 1.02;
  }
  .tile-sub {
    position: relative;
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    opacity: 0.85;
  }
  @media (max-width: 1023px) {
    min-height: 150px;
    padding: 20px;
    border-radius: 20px;
    .tile-title {
      font-size: 1.35rem;
    }
  }
`;

function BentoImage({ src, alt = "", priority = false, sizes }) {
  if (!src) return null;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} style={{ objectFit: "cover" }} />;
}

const DEFAULT_TILES = [
  { eyebrow: "Sale", title: "Bis zu −50 %", subtitle: "auf ausgewählte Marken", link: "/sale", bg_color: INK, text_color: "#FFFFFF", eyebrow_color: "#EE8A12" },
  { eyebrow: "Neuheiten", title: "Frisch eingetroffen", subtitle: "Alle ansehen", link: "/neuheiten", bg_color: "#DCE3D6", text_color: INK, eyebrow_color: "#2F5A36", arrow: true },
];

export function PromoBento({ container, locale = "de", headingLevel = 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const badge = lt(container, "badge", locale);
  const title = lt(container, "title", locale);
  const text = lt(container, "text", locale);
  const btn1 = lt(container, "btn_text", locale);
  const btn2 = lt(container, "btn2_text", locale);
  const images = (Array.isArray(container.images) ? container.images : []).slice(0, 4);
  const tiles = Array.isArray(container.tiles) && container.tiles.length ? container.tiles.slice(0, 2) : DEFAULT_TILES;
  const mainBg = container.bg_color || "#FCEBD5";
  const mainImage = img(container.bg_image);

  return (
    <WarmSection $pad={container.padding || "32px 24px 0"} $padMobile="16px 16px 0">
      <Bento>
        <BentoMain style={{ background: mainBg, color: container.text_color || INK }}>
          {mainImage ? <BentoImage src={mainImage} priority sizes="(max-width: 1023px) 100vw, 870px" /> : null}
          <BentoCopy>
            {badge ? <span className="bento-badge">{badge}</span> : null}
            {title ? <Heading>{title}</Heading> : null}
            {text ? <p>{text}</p> : null}
            {(btn1 || btn2) && (
              <div className="bento-ctas">
                {btn1 ? <SmartLink href={container.btn_url} className="bento-cta bento-cta--solid">{btn1}</SmartLink> : null}
                {btn2 ? <SmartLink href={container.btn2_url} className="bento-cta bento-cta--outline">{btn2}</SmartLink> : null}
              </div>
            )}
          </BentoCopy>
          {!mainImage ? (
            <BentoCollage aria-hidden="true">
              {[0, 1, 2, 3].map((i) => {
                const src = img(lt(images[i] || {}, "url", locale));
                const tone = images[i]?.color || ["#F1CFA6", "#FFFFFF", "#FFFFFF", "#E8B77A"][i];
                return (
                  <div key={i} style={{ background: tone }}>
                    <BentoImage src={src} sizes="220px" priority={i < 2} />
                  </div>
                );
              })}
            </BentoCollage>
          ) : null}
        </BentoMain>
        <BentoSide>
          {tiles.map((t, i) => {
            const tileImage = img(t.image);
            const fg = t.text_color || (i === 0 ? "#FFFFFF" : INK);
            return (
              <BentoTile key={i} href={t.link} style={{ background: t.bg_color || (i === 0 ? INK : "#DCE3D6"), color: fg }}>
                <BentoImage src={tileImage} sizes="(max-width: 1023px) 50vw, 430px" />
                <span className="tile-eyebrow" style={{ color: t.eyebrow_color || (i === 0 ? "#EE8A12" : "#2F5A36") }}>{lt(t, "eyebrow", locale)}</span>
                <span>
                  <span className="tile-title" style={{ display: "block" }}>{lt(t, "title", locale)}</span>
                  {lt(t, "subtitle", locale) ? (
                    <span className="tile-sub">
                      {lt(t, "subtitle", locale)}
                      {t.arrow ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </BentoTile>
            );
          })}
        </BentoSide>
      </Bento>
    </WarmSection>
  );
}

/* ── Trust bar icons (feature_grid variant "trust_bar") ────────────────── */

const TRUST_ICONS = {
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  points: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
  badge: <><path d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.9-3.1 3.2.3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  return: <><path d="M4 10h11a5 5 0 0 1 0 10H9" /><path d="M8 6l-4 4 4 4" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  leaf: <path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
};

export const TRUST_ICON_KEYS = Object.keys(TRUST_ICONS);

export function TrustBarIcon({ name }) {
  const key = String(name || "").trim().toLowerCase();
  const icon = TRUST_ICONS[key];
  return (
    <span
      aria-hidden="true"
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        flexShrink: 0,
        background: "#FCEBD5",
        color: "var(--shop-accent, #A65300)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
      }}
    >
      {icon ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      ) : (
        name || "✓"
      )}
    </span>
  );
}

/* ── Category circles ("Beliebte Kategorien") ─────────────────────────── */

const Circles = styled.div`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$cols}, minmax(0, 1fr));
  gap: 20px;
  a {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: var(--body-color, ${INK});
    font-weight: 600;
    text-align: center;
  }
  a:hover .circle {
    transform: scale(1.03);
  }
  .circle {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    overflow: hidden;
    transition: transform 0.2s ease;
  }
  @media (max-width: 1023px) {
    grid-template-columns: repeat(${(p) => Math.min(4, p.$cols)}, minmax(0, 1fr));
  }
  @media (max-width: 767px) {
    display: flex;
    overflow-x: auto;
    gap: 14px;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
    a {
      flex: 0 0 96px;
      font-size: 13px;
      gap: 8px;
    }
  }
`;

export function CategoryCircles({ container, locale = "de" }) {
  const title = lt(container, "title", locale);
  const linkText = lt(container, "link_text", locale);
  const max = Math.max(2, Math.min(12, Number(container.max_items) || 6));
  const manual = (Array.isArray(container.items) ? container.items : []).filter((it) => String(it?.link || "").trim() && String(lt(it, "label", locale) || "").trim());
  const useCatalog = container.source !== "manual" || manual.length === 0;
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    if (!useCatalog) return undefined;
    let cancelled = false;
    cachedJsonFetch(`/api/store-categories${shallowCategoriesQuery(locale)}`, { ttlMs: 60000 })
      .then((res) => {
        if (cancelled) return;
        const tree = Array.isArray(res?.tree) ? res.tree : [];
        setCatalog(
          tree
            .filter((n) => n && n.has_products !== false && (n.slug || n.handle))
            .map((n) => ({
              label: getLocalizedCategory(n, locale).name || n.name,
              link: `/${String(n.slug || n.handle).replace(/^\//, "")}`,
              image: n.image_url || n.thumbnail || n.metadata?.image_url || n.banner_image_url || "",
            })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [useCatalog, locale]);

  const items = (useCatalog ? catalog : manual.map((it) => ({ label: lt(it, "label", locale), link: it.link, image: it.image }))).slice(0, max);
  if (!items.length) return null;
  const cols = Math.min(max, items.length);

  return (
    <WarmSection $pad={container.padding}>
      {(title || linkText) && (
        <WarmSectionHead>
          {title ? <h2>{title}</h2> : <span />}
          {linkText ? <SmartLink href={container.link_url || "/"}>{linkText}</SmartLink> : null}
        </WarmSectionHead>
      )}
      <Circles $cols={cols}>
        {items.map((it, i) => {
          const src = img(it.image);
          return (
            <SmartLink key={`${it.link}-${i}`} href={it.link}>
              <span className="circle" style={{ background: TONES[i % TONES.length] }}>
                {src ? <Image src={src} alt="" fill sizes="(max-width: 767px) 96px, 200px" style={{ objectFit: "cover" }} /> : null}
              </span>
              <span>{it.label}</span>
            </SmartLink>
          );
        })}
      </Circles>
    </WarmSection>
  );
}
