"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { useShopStyles } from "@/context/ShopStylesContext";

const Outer = styled.div`
  width: 100%;
  flex-shrink: 0;
`;

const InlineInner = styled.div`
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px 28px;
  min-height: inherit;
  box-sizing: border-box;
`;

const ItemLink = styled(Link)`
  color: inherit;
  text-decoration: none;
  opacity: 0.95;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 1;
    text-decoration: underline;
  }
`;

const CarouselRoot = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: inherit;
`;

const CarouselViewport = styled.div`
  position: relative;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  overflow: hidden;
  touch-action: pan-y;

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const CarouselTrack = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
`;

const CarouselSlide = styled.div`
  flex: 0 0 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 42px;
  box-sizing: border-box;
  text-align: center;
`;

const NavBtn = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: inherit;
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.2s ease, background 0.2s ease;

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.22);
  }

  &:disabled {
    opacity: 0.25;
    cursor: default;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const NavPrev = styled(NavBtn)`
  left: 6px;
`;

const NavNext = styled(NavBtn)`
  right: 6px;
`;

function isTopBarEnabled(tb) {
  const v = tb?.enabled;
  return v === true || v === "true" || v === 1 || v === "1";
}

function normalizeItems(tb) {
  const raw = tb?.items;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      text: String(row?.text || "").trim(),
      href: String(row?.href || "").trim() || "#",
    }))
    .filter((row) => row.text.length > 0);
}

export default function ShopTopBar() {
  const styles = useShopStyles();
  const tb = styles?.topbar || {};
  const enabled = isTopBarEnabled(tb);
  const items = normalizeItems(tb);
  const mode = tb.display_mode === "carousel" ? "carousel" : "inline";
  const intervalSec = Math.min(120, Math.max(2, Number(tb.carousel_interval_sec) || 5));

  const [idx, setIdx] = useState(0);
  const touchStartX = useRef(null);
  const pausedRef = useRef(false);

  const n = items.length;
  const goNext = useCallback(() => {
    if (n <= 1) return;
    setIdx((i) => (i + 1) % n);
  }, [n]);

  const goPrev = useCallback(() => {
    if (n <= 1) return;
    setIdx((i) => (i - 1 + n) % n);
  }, [n]);

  useEffect(() => {
    setIdx(0);
  }, [n, mode]);

  useEffect(() => {
    if (!enabled || mode !== "carousel" || n <= 1) return;
    const ms = intervalSec * 1000;
    const id = setInterval(() => {
      if (!pausedRef.current) setIdx((i) => (i + 1) % n);
    }, ms);
    return () => clearInterval(id);
  }, [enabled, mode, n, intervalSec]);

  if (!enabled || n === 0) return null;

  if (mode === "inline") {
    return (
      <Outer className="topbar shop-topbar" role="region" aria-label="Hinweise">
        <InlineInner>
          {items.map((item, i) => (
            <ItemLink key={`${item.href}-${i}`} href={item.href === "#" ? "/" : item.href}>
              {item.text}
            </ItemLink>
          ))}
        </InlineInner>
      </Outer>
    );
  }

  const onTouchStart = (e) => {
    if (!e.touches?.[0]) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null || !e.changedTouches?.[0]) return;
    const dx = e.changedTouches[0].clientX - start;
    if (dx < -48) goNext();
    else if (dx > 48) goPrev();
  };

  return (
    <Outer
      className="topbar shop-topbar"
      role="region"
      aria-label="Hinweise"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <CarouselRoot>
        {n > 1 && (
          <NavPrev
            type="button"
            aria-label="Zurück"
            onClick={() => { goPrev(); pausedRef.current = true; }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </NavPrev>
        )}
        <CarouselViewport
          tabIndex={0}
          role="group"
          aria-roledescription="Karussell"
          aria-label="Top-Bar Hinweise"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              goPrev();
              pausedRef.current = true;
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              goNext();
              pausedRef.current = true;
            }
          }}
        >
          <CarouselTrack style={{ transform: `translateX(-${idx * 100}%)` }}>
            {items.map((item, i) => (
              <CarouselSlide key={`${item.href}-${i}`}>
                <ItemLink href={item.href === "#" ? "/" : item.href}>{item.text}</ItemLink>
              </CarouselSlide>
            ))}
          </CarouselTrack>
        </CarouselViewport>
        {n > 1 && (
          <NavNext
            type="button"
            aria-label="Weiter"
            onClick={() => { goNext(); pausedRef.current = true; }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </NavNext>
        )}
      </CarouselRoot>
    </Outer>
  );
}
