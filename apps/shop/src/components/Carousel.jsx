"use client";

import React, { useRef, useState, useEffect, useCallback, useSyncExternalStore } from "react";
import styled from "styled-components";
import { tokens } from "@/design-system/tokens";

/* ─── Section & layout ─────────────────────────────────────────────────── */
const Section = styled.section`
  padding: ${tokens.sectionGap} ${tokens.containerPadding};
  max-width: 1280px;
  margin: 0 auto;
  position: relative;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${tokens.spacing.xl};
  gap: 16px;
  flex-wrap: wrap;
`;

const TitleRowLeft = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${tokens.spacing.lg};
`;

const Title = styled.h2`
  font-family: var(--h2-ff, ${tokens.fontFamily.sans});
  font-size: var(--h2-fs, clamp(1.125rem, 2vw, 1.375rem));
  font-weight: var(--h2-fw, 600);
  font-style: var(--h2-style, normal);
  color: var(--h2-color, ${tokens.dark[900]});
  letter-spacing: var(--h2-ls, -0.02em);
  line-height: var(--h2-lh, 1.3);
  margin: 0;
`;

/* ─── Nav buttons: AAA focus, touch target 44px, subtle depth ───────────── */
const NavBtn = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 6px;
  border: 1px solid ${tokens.border.light};
  background: #fff;
  color: ${tokens.dark[700]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background ${tokens.transition.base}, border-color ${tokens.transition.base},
    color ${tokens.transition.base};

  &:hover:not(:disabled) {
    background: ${tokens.background.soft};
    border-color: #d1d5db;
    color: ${tokens.dark[900]};
  }
  &:active:not(:disabled) {
    background: #f3f4f6;
    transform: scale(0.98);
  }
  @media (prefers-reduced-motion: no-preference) {
    transition:
      background ${tokens.transition.base},
      border-color ${tokens.transition.base},
      color ${tokens.transition.base},
      transform 0.18s var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  &:focus {
    outline: none;
  }
  &:focus-visible {
    outline: 2px solid ${tokens.primary.DEFAULT};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  svg {
    width: 20px;
    height: 20px;
  }
  /* Mobil / Touch: oklar yok, yatay kaydırma yeter (SSR + JS aynı davranış) */
  @media (max-width: 1279px) {
    display: none !important;
  }
  @media (pointer: coarse) {
    display: none !important;
  }
`;

const SIDE_NAV_WIDTH = 52;

const CarouselWrap = styled.div`
  position: relative;
  margin: 0 -${tokens.containerPadding};
`;

const NavSide = styled(NavBtn)`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;

  &:hover:not(:disabled) {
    transform: translateY(-50%);
  }
  &:active:not(:disabled) {
    transform: translateY(-50%) scale(0.98);
  }
  &:disabled {
    transform: translateY(-50%);
  }
`;
const NavLeftSide = styled(NavSide)`
  left: ${tokens.containerPadding};
`;
const NavRightSide = styled(NavSide)`
  right: ${tokens.containerPadding};
`;

/* ─── Scroll track: programatik kaydırma + CSS smooth (a11y: reduce’da anında) ─ */
const Scroll = styled.div`
  display: flex;
  gap: ${(p) => p.$gap ?? 20}px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px ${(p) => (p.$navOnSides ? SIDE_NAV_WIDTH : tokens.containerPadding)}px 20px;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: ${(p) => (p.$navOnSides ? SIDE_NAV_WIDTH : 0)}px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scroll-behavior: smooth;

  @media (max-width: 1279px) {
    padding: 12px ${tokens.containerPadding} 20px;
    scroll-padding-inline: 0;
  }
  @media (pointer: coarse) {
    padding: 12px ${tokens.containerPadding} 20px;
    scroll-padding-inline: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    scroll-behavior: auto;
  }

  & > * {
    flex-shrink: 0;
    scroll-snap-align: start;
  }
`;

const SlideWrapper = styled.div`
  width: ${(p) =>
    p.$visibleCount
      ? `calc((100% - ${(p.$visibleCount - 1) * (p.$gap ?? 20)}px) / ${p.$visibleCount})`
      : `${p.$itemWidth ?? 260}px`};
  min-width: ${(p) => (p.$visibleCount ? undefined : `${p.$itemWidth ?? 260}px`)};
  scroll-snap-align: start;
`;

/* ─── Edge fades: wider, softer gradient for premium feel ───────────────── */
const FadeEdge = styled.div`
  position: absolute;
  top: 0;
  bottom: 28px;
  width: 80px;
  pointer-events: none;
  z-index: 1;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  background: ${(p) => p.$gradient};
  transition: opacity var(--app-duration-tap, 0.2s) var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
const FadeLeft = styled(FadeEdge)`
  left: 0;
`;
const FadeRight = styled(FadeEdge)`
  right: 0;
`;

/* ─── Progress bar: shows scroll position (optional) ──────────────────────── */
const ProgressTrack = styled.div`
  height: 3px;
  background: ${tokens.border.light};
  border-radius: 2px;
  margin: 0 ${tokens.containerPadding};
  margin-top: -16px;
  margin-bottom: 8px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: ${tokens.primary.DEFAULT};
  border-radius: 2px;
  width: ${(p) => p.$percent}%;
  transition: width var(--app-duration-tap, 0.2s) var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const NavLeftSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const NavRightSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

/** Schmale Viewports + Touch-Geräte: keine Pfeile (Wischen/Scroll) */
const CAROUSEL_HIDE_ARROWS_MQS = [
  "(max-width: 1279px)",
  "(pointer: coarse)",
];

function getCarouselHideArrows() {
  if (typeof window === "undefined") return false;
  return CAROUSEL_HIDE_ARROWS_MQS.some((q) => window.matchMedia(q).matches);
}

function useHideCarouselArrowsOnMobile() {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const mqs = CAROUSEL_HIDE_ARROWS_MQS.map((q) => window.matchMedia(q));
      mqs.forEach((m) => m.addEventListener("change", onChange));
      return () => mqs.forEach((m) => m.removeEventListener("change", onChange));
    },
    getCarouselHideArrows,
    () => false,
  );
}

/**
 * AAA-quality horizontal carousel: smooth scroll, fade edges, progress, reduced motion.
 *
 * @param {string} [title] - Section title (if no custom header)
 * @param {React.ReactNode} [header] - Custom header content (left side)
 * @param {boolean} [showNav=true] - Prev/next buttons
 * @param {boolean} [navOnSides=false] - Nav buttons sol/sağ kenarda (visibleCount ile birlikte kullanılır)
 * @param {number} [visibleCount] - Aynı anda görünen kart sayısı (örn. 4)
 * @param {boolean} [autoPlay=false] - Otomatik kaydırma
 * @param {number} [autoPlayInterval=4500] - Otomatik kayma aralığı (ms)
 * @param {boolean} [showFade=true] - Edge gradient fades
 * @param {boolean} [showProgressBar=false] - Progress bar
 * @param {number} [itemWidth=260] - Slide genişliği (visibleCount yoksa)
 * @param {number} [gap=20] - Kartlar arası boşluk
 * @param {string} [fadeBgColor] - Fade rengi
 * @param {boolean} [contained=true] - Section wrapper
 * @param {string} [ariaLabel] - Erişilebilirlik etiketi
 * @param {React.ReactNode} children - Slide content
 */
export default function Carousel({
  title,
  header,
  showNav = true,
  navOnSides = false,
  visibleCount,
  autoPlay = false,
  autoPlayInterval = 4500,
  showFade = false,
  showProgressBar = false,
  itemWidth = 260,
  gap = 20,
  fadeBgColor = "rgba(255,255,255,0.97)",
  contained = true,
  ariaLabel,
  children,
  className,
}) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const items = React.Children.toArray(children);
  const isMobileViewport = useHideCarouselArrowsOnMobile();
  const showNavControls = showNav && !isMobileViewport;
  const useSideNav = showNavControls && navOnSides;
  const loopMode = Boolean(autoPlay && items.length > (visibleCount || 1));
  const itemsForRender = loopMode ? [...items, ...items] : items;

  const updateState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    let { scrollLeft, scrollWidth, clientWidth } = el;
    /* Loop: sonda iken anında ilk yarıya sar (sonsuz döngü) */
    if (loopMode && scrollWidth > clientWidth) {
      const half = scrollWidth / 2;
      if (scrollLeft >= half - 2) {
        el.scrollLeft = scrollLeft - half;
        return;
      }
    }
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft < maxScroll - 2);
    setScrollProgress(maxScroll > 0 ? (scrollLeft / maxScroll) * 100 : 0);
  }, [loopMode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateState();
    el.addEventListener("scroll", updateState, { passive: true });
    const ro = new ResizeObserver(updateState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateState);
      ro.disconnect();
    };
  }, [itemsForRender.length, updateState]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const scroll = useCallback(
    (dir) => {
      const el = scrollRef.current;
      if (!el) return;
      const step = visibleCount
        ? (el.clientWidth - (visibleCount - 1) * gap) / visibleCount + gap
        : itemWidth + gap;
      const behavior = prefersReducedMotion ? "auto" : "smooth";
      el.scrollBy({ left: dir * step, behavior });
    },
    [visibleCount, itemWidth, gap, prefersReducedMotion]
  );

  /* Otomatik kayma: loop modunda süre dolunca tek ürün ileri (sonda scroll listener başa sarar) */
  useEffect(() => {
    if (!autoPlay || paused || prefersReducedMotion || items.length <= (visibleCount || 1)) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = setInterval(() => {
      scroll(1);
    }, autoPlayInterval);
    return () => clearInterval(id);
  }, [autoPlay, paused, autoPlayInterval, prefersReducedMotion, items.length, visibleCount, scroll]);

  const handleKeyDown = useCallback(
    (e) => {
      const el = scrollRef.current;
      if (!el) return;
      const edgeBehavior = prefersReducedMotion ? "auto" : "smooth";
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          scroll(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          scroll(1);
          break;
        case "Home":
          e.preventDefault();
          el.scrollTo({ left: 0, behavior: edgeBehavior });
          break;
        case "End":
          e.preventDefault();
          el.scrollTo({ left: el.scrollWidth - el.clientWidth, behavior: edgeBehavior });
          break;
        default:
          break;
      }
    },
    [scroll, prefersReducedMotion]
  );

  const gradientLeft = `linear-gradient(to right, ${fadeBgColor}, transparent)`;
  const gradientRight = `linear-gradient(to left, ${fadeBgColor}, transparent)`;
  const navInHeader = showNavControls && !useSideNav;

  const hasTitle = title != null && String(title).trim() !== "";
  const content = (
    <>
      {(hasTitle || header != null || navInHeader) && (
        <TitleRow>
          <TitleRowLeft>
            {header != null ? header : hasTitle ? <Title>{title}</Title> : null}
          </TitleRowLeft>
          {navInHeader && (
            <div style={{ display: "flex", gap: 10 }} role="group" aria-label="Carousel navigation">
              <NavBtn
                type="button"
                onClick={() => scroll(-1)}
                disabled={!canScrollLeft}
                aria-label="Vorherige Einträge"
              >
                <NavLeftSvg />
              </NavBtn>
              <NavBtn
                type="button"
                onClick={() => scroll(1)}
                disabled={!canScrollRight}
                aria-label="Nächste Einträge"
              >
                <NavRightSvg />
              </NavBtn>
            </div>
          )}
        </TitleRow>
      )}
      <CarouselWrap>
        {showFade && (
          <>
            <FadeLeft $visible={canScrollLeft} $gradient={gradientLeft} aria-hidden />
            <FadeRight $visible={canScrollRight} $gradient={gradientRight} aria-hidden />
          </>
        )}
        {useSideNav && (
          <>
            <NavLeftSide
              type="button"
              onClick={() => scroll(-1)}
              disabled={!canScrollLeft}
              aria-label="Vorherige Einträge"
            >
              <NavLeftSvg />
            </NavLeftSide>
            <NavRightSide
              type="button"
              onClick={() => scroll(1)}
              disabled={!canScrollRight}
              aria-label="Nächste Einträge"
            >
              <NavRightSvg />
            </NavRightSide>
          </>
        )}
        <Scroll
          ref={scrollRef}
          $gap={gap}
          $navOnSides={useSideNav}
          role="region"
          aria-label={ariaLabel || title || "Carousel"}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {itemsForRender.map((child, i) => (
            <SlideWrapper
              key={i}
              $itemWidth={itemWidth}
              $visibleCount={visibleCount}
              $gap={gap}
            >
              {child}
            </SlideWrapper>
          ))}
        </Scroll>
        {showProgressBar && items.length > 0 && (
          <ProgressTrack aria-hidden>
            <ProgressFill $percent={scrollProgress} />
          </ProgressTrack>
        )}
      </CarouselWrap>
    </>
  );

  if (contained) {
    return <Section className={className}>{content}</Section>;
  }
  return <div className={className}>{content}</div>;
}
