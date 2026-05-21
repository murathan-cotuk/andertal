"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useVisualViewportBottomInset } from "@/hooks/useVisualViewportBottomInset";

const DEFAULT_ACCENT = "#1b8880";

function backdropBlurFromToken(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "blur(0px)";
  if (/blur\s*\(/i.test(s)) return s;
  return `blur(${s})`;
}

export default function ModernMobileBottomNav({
  items = [],
  accentColor = DEFAULT_ACCENT,
  /** Aşağı kaydırırken çubuğu ekran dışına kaydır (yalnızca layout=fixed) — geriye uyumluluk */
  recessed = false,
  /** 0–1: kaydırma ile kademeli gizleme (recessed yerine tercih edilir) */
  recessProgress = recessed ? 1 : 0,
  /** fixed = viewport altı; inline = sayfa akışı (MobileShell flex sonu) */
  layout = "fixed",
  surfaceBg,
  borderTop,
  blur,
  boxShadow,
}) {
  const finalItems = useMemo(() => {
    const valid = Array.isArray(items) && items.length >= 2 && items.length <= 5;
    return valid ? items : [];
  }, [items]);

  /* Visual viewport bottom inset: height of the browser's own bottom toolbar (Samsung Internet,
     Chrome on Android, Safari). Positioning the bar at `bottom: visualInset` keeps it above
     the browser chrome on every device without needing hardcoded pixel values. */
  const visualInset = useVisualViewportBottomInset();

  const [activeIndex, setActiveIndex] = useState(0);
  const textRefs = useRef([]);
  const itemRefs = useRef([]);

  useEffect(() => {
    const idx = finalItems.findIndex((i) => i.active);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [finalItems]);

  useEffect(() => {
    const setLineWidth = () => {
      const activeItemElement = itemRefs.current[activeIndex];
      const activeTextElement = textRefs.current[activeIndex];
      if (activeItemElement && activeTextElement) {
        activeItemElement.style.setProperty("--lineWidth", `${activeTextElement.offsetWidth}px`);
      }
    };
    setLineWidth();
    window.addEventListener("resize", setLineWidth);
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener("resize", setLineWidth);
      vv.addEventListener("scroll", setLineWidth);
    }
    return () => {
      window.removeEventListener("resize", setLineWidth);
      if (vv) {
        vv.removeEventListener("resize", setLineWidth);
        vv.removeEventListener("scroll", setLineWidth);
      }
    };
  }, [activeIndex, finalItems]);

  if (!finalItems.length) return null;

  const isFixed = layout !== "inline";
  const blurCss = backdropBlurFromToken(blur ?? "12px");
  const hideT = Math.min(1, Math.max(0, recessProgress ?? (recessed ? 1 : 0)));
  const slideExpr = `calc(${hideT} * (100% + ${visualInset}px + env(safe-area-inset-bottom, 0px)))`;

  return (
    <nav
      aria-label="Mobile Navigation"
      aria-hidden={isFixed && hideT >= 0.98 ? true : undefined}
      style={{
        "--component-active-color": accentColor,
        display: "grid",
        gridTemplateColumns: `repeat(${finalItems.length}, minmax(0, 1fr))`,
        position: isFixed ? "fixed" : "relative",
        /* visualInset tracks the browser's own bottom toolbar height (Samsung Internet, Chrome,
           Safari). Setting bottom to this value keeps the bar above the browser chrome on every
           mobile device without any hardcoded pixel values. */
        bottom: isFixed ? visualInset : undefined,
        left: isFixed ? 0 : undefined,
        right: isFixed ? 0 : undefined,
        width: "100%",
        flexShrink: 0,
        height: "calc(60px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: surfaceBg ?? "#fff",
        borderTop: borderTop ?? "1px solid rgba(229,231,235,0.9)",
        backdropFilter: hideT > 0.02 ? undefined : blurCss,
        WebkitBackdropFilter: hideT > 0.02 ? undefined : blurCss,
        boxShadow: boxShadow ?? "0 -2px 12px rgba(0,0,0,0.07)",
        zIndex: isFixed ? 2147483640 : 100,
        willChange: isFixed ? "transform" : undefined,
        transform: isFixed && hideT > 0 ? `translateY(${slideExpr})` : undefined,
        pointerEvents: isFixed && hideT >= 0.95 ? "none" : "auto",
      }}
    >
      {finalItems.map((item, index) => {
        const isActive = index === activeIndex;
        const textColor = isActive ? "var(--component-active-color)" : "#6b7280";
        const common = {
          ref: (el) => {
            itemRefs.current[index] = el;
          },
          style: {
            "--lineWidth": "0px",
            border: "none",
            background: "transparent",
            padding: "2px 4px 0",
            width: "100%",
            minWidth: 0,
            height: "100%",
            minHeight: 0,
            color: textColor,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            justifyContent: "space-between",
            WebkitTapHighlightColor: "transparent",
            textDecoration: "none",
            fontFamily: "inherit",
            cursor: "pointer",
            boxSizing: "border-box",
          },
        };

        const content = (
          <>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
              }}
            >
              <div style={{ position: "relative", display: "inline-flex" }}>
                {item.icon}
                {item.badge > 0 ? (
                  <span
                    style={{
                      position: "absolute",
                      top: -5,
                      right: -7,
                      background: isActive ? "var(--component-active-color)" : "#6b7280",
                      color: "#fff",
                      borderRadius: "50%",
                      minWidth: 16,
                      height: 16,
                      fontSize: 9,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                      padding: "0 3px",
                    }}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </div>
              <strong
                ref={(el) => {
                  textRefs.current[index] = el;
                }}
                style={{
                  fontSize: 10,
                  lineHeight: 1.1,
                  fontWeight: isActive ? 700 : 500,
                  opacity: isActive ? 1 : 0.75,
                  transition: "opacity 0.18s ease, color 0.18s ease",
                }}
              >
                {item.label}
              </strong>
            </div>
            {/* Line in normal flow at bottom of tab — avoids absolute+env() shifting on scroll / viewport changes */}
            <div
              style={{
                height: 5,
                flexShrink: 0,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                boxSizing: "border-box",
                paddingBottom: 1,
              }}
              aria-hidden
            >
              {isActive ? (
                <span
                  style={{
                    height: 3,
                    width: "var(--lineWidth)",
                    maxWidth: "100%",
                    borderRadius: 999,
                    background: "var(--component-active-color)",
                    transition: "width 0.2s ease",
                  }}
                />
              ) : null}
            </div>
          </>
        );

        if (item.href) {
          return (
            <Link key={item.key || item.label} href={item.href} {...common} onClick={item.onClick}>
              {content}
            </Link>
          );
        }
        return (
          <button key={item.key || item.label} type="button" {...common} onClick={item.onClick}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
