"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { tokens } from "@/design-system/tokens";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { resolveFreeShippingThresholdCents } from "@/lib/free-shipping-threshold";
import { formatPriceCents } from "@/lib/format";

const Bar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-family: ${tokens.fontFamily.sans};
`;

const Container = styled.div`
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 0 ${tokens.containerPadding};
  display: flex;
  justify-content: center;
  align-items: center;
  gap: ${tokens.spacing.xl};
  flex-wrap: wrap;

  /* Mobile: hide the multi-item layout */
  @media (max-width: 767px) {
    display: none;
  }
`;

/* Mobile carousel wrapper */
const MobileCarousel = styled.div`
  display: none;
  width: 100%;
  overflow: hidden;
  position: relative;

  @media (max-width: 767px) {
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

const CarouselTrack = styled.div`
  display: flex;
  transition: transform 0.4s ease;
  width: 100%;
`;

const CarouselSlide = styled.div`
  min-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  text-align: center;
`;

const Item = styled(Link)`
  color: inherit;
  text-decoration: none;
  transition: opacity ${tokens.transition.base};

  &:hover {
    opacity: 0.9;
  }
`;

const STATIC_LINKS = [
  { text: "Kontakt", href: "/contact" },
  { text: "Retouren & Umtausch", href: "/returns" },
  { text: "Sicher einkaufen", href: "/secure" },
];

const CAROUSEL_INTERVAL = 5000;

export default function TopBar() {
  const prefix = useMarketPrefix();
  const marketCountry = (prefix?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const envThresholdCents =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS
      ? Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS)
      : null;

  const [rawThresholds, setRawThresholds] = useState(null);
  const [announcementItems, setAnnouncementItems] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    fetch("/api/store-seller-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.free_shipping_thresholds && typeof d.free_shipping_thresholds === "object") {
          setRawThresholds(d.free_shipping_thresholds);
        } else if (d?.free_shipping_threshold_cents != null) {
          setRawThresholds({ DE: d.free_shipping_threshold_cents });
        } else {
          setRawThresholds(null);
        }
        if (Array.isArray(d?.announcement_bar_items) && d.announcement_bar_items.length > 0) {
          setAnnouncementItems(d.announcement_bar_items);
        }
      })
      .catch(() => setRawThresholds(null));
  }, []);

  const thresholdCents = resolveFreeShippingThresholdCents(rawThresholds, marketCountry, envThresholdCents);

  const items = useMemo(() => {
    const first =
      thresholdCents != null
        ? [{ text: `Kostenloser Versand ab ${formatPriceCents(thresholdCents)} €`, href: "/shipping" }]
        : [];
    // On desktop: use static fallback if no announcement items configured
    const extra = announcementItems.length > 0 ? announcementItems : STATIC_LINKS;
    return [...first, ...extra];
  }, [thresholdCents, announcementItems]);

  // Auto-slide on mobile
  useEffect(() => {
    if (items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIdx((i) => (i + 1) % items.length);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [items.length]);

  return (
    <Bar className="topbar">
      {/* Desktop: show all items */}
      <Container>
        {items.slice(0, 4).map((item, i) => (
          <Item key={`${item.href}-${i}`} href={item.href || "#"}>
            {item.text}
          </Item>
        ))}
      </Container>

      {/* Mobile: carousel — one item at a time, auto-slides every 5s */}
      <MobileCarousel>
        <CarouselTrack style={{ transform: `translateX(-${activeIdx * 100}%)` }}>
          {items.map((item, i) => (
            <CarouselSlide key={`m-${item.href}-${i}`}>
              <Item href={item.href || "#"}>{item.text}</Item>
            </CarouselSlide>
          ))}
        </CarouselTrack>
      </MobileCarousel>
    </Bar>
  );
}
