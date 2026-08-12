"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import styles from "./BecomeSellerLanding.module.css";
import { BecomeSellerSection } from "./BecomeSellerSections";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&display=swap";

function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const nodes = root.querySelectorAll(`.${styles.reveal}`);
    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach((n) => n.classList.add(styles.in));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.in);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

export default function BecomeSellerLanding({ containers } = {}) {
  const locale = useLocale();
  const rootRef = useRef(null);
  useReveal(rootRef);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const existing = document.querySelector(`link[data-become-seller-fonts="1"]`);
    if (existing) return undefined;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    link.setAttribute("data-become-seller-fonts", "1");
    document.head.appendChild(link);
    return undefined;
  }, []);

  const list = Array.isArray(containers) ? containers.filter((c) => c && c.visible !== false) : [];
  let gridIndex = 0;

  return (
    <div className={styles.root} ref={rootRef} data-become-seller-landing="1">
      {list.map((container) => {
        const idx = container.type === "feature_grid" ? gridIndex++ : 0;
        return (
          <BecomeSellerSection
            key={container.id}
            container={container}
            locale={locale}
            gridIndex={container.type === "feature_grid" ? idx : 0}
          />
        );
      })}
    </div>
  );
}

export const BECOME_SELLER_PAGE_SLUGS = new Set(["verkaeufer-werden", "become-a-seller"]);
export const BECOME_SELLER_LAYOUT_PREFIX = "become_seller";
