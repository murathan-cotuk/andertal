"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";

const DEFAULT_ACCENT = "#1b8880";

export default function ModernMobileBottomNav({
  items = [],
  accentColor = DEFAULT_ACCENT,
  bottomInsetPx = 0,
}) {
  const finalItems = useMemo(() => {
    const valid = Array.isArray(items) && items.length >= 2 && items.length <= 5;
    return valid ? items : [];
  }, [items]);

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
    return () => window.removeEventListener("resize", setLineWidth);
  }, [activeIndex, finalItems]);

  if (!finalItems.length) return null;

  return (
    <nav
      aria-label="Mobile Navigation"
      style={{
        "--component-active-color": accentColor,
        display: "grid",
        gridTemplateColumns: `repeat(${finalItems.length}, minmax(0, 1fr))`,
        position: "fixed",
        bottom: bottomInsetPx,
        left: 10,
        right: 10,
        height: "calc(62px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "rgba(255,255,255,0.95)",
        border: "1px solid rgba(229,231,235,0.95)",
        borderRadius: 18,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
        zIndex: 2147483640,
        transition: "bottom 0.12s ease-out",
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
            padding: "3px 4px 0",
            width: "100%",
            minWidth: 0,
            color: textColor,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            position: "relative",
            WebkitTapHighlightColor: "transparent",
            textDecoration: "none",
            fontFamily: "inherit",
            cursor: "pointer",
          },
        };

        const content = (
          <>
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
                position: "relative",
              }}
            >
              {item.label}
            </strong>
            {isActive ? (
              <span
                style={{
                  position: "absolute",
                    bottom: "calc(env(safe-area-inset-bottom, 0px) + 2px)",
                    height: 3,
                  width: "var(--lineWidth)",
                  borderRadius: 999,
                  background: "var(--component-active-color)",
                  transition: "width 0.2s ease",
                }}
              />
            ) : null}
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
