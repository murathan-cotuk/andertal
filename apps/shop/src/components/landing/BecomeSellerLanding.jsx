"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { Instrument_Serif, Manrope } from "next/font/google";
import styles from "./BecomeSellerLanding.module.css";
import { BecomeSellerSection } from "./BecomeSellerSections";

// Self-hosted via next/font instead of a runtime-injected <link> (which used to fetch fonts
// AFTER mount, i.e. after hydration — guaranteed FOUC/CLS on this route every load).
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-manrope",
});

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

  const list = Array.isArray(containers) ? containers.filter((c) => c && c.visible !== false) : [];
  let gridIndex = 0;

  return (
    <div
      className={`${styles.root} ${instrumentSerif.variable} ${manrope.variable}`}
      ref={rootRef}
      data-become-seller-landing="1"
    >
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
