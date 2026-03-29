"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { tokens } from "@/design-system/tokens";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { resolveFreeShippingThresholdCents } from "@/lib/free-shipping-threshold";
import { formatPriceCents } from "@/lib/format";

const TOP_BAR_HEIGHT = "32px";
const TOP_BAR_BG = "#e4eaf2";

const Bar = styled.div`
  height: ${TOP_BAR_HEIGHT};
  min-height: ${TOP_BAR_HEIGHT};
  background: ${TOP_BAR_BG};
  color: #2c3e5a;
  font-size: 12px;
  font-family: ${tokens.fontFamily.sans};
  display: flex;
  align-items: center;
  justify-content: center;
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

export default function TopBar() {
  const prefix = useMarketPrefix();
  /** Storefront region from URL — not checkout LS (avoids wrong threshold on /gb/). */
  const marketCountry = (prefix?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const envThresholdCents =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS
      ? Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS)
      : null;

  const [rawThresholds, setRawThresholds] = useState(null);
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
      })
      .catch(() => setRawThresholds(null));
  }, []);

  const thresholdCents = resolveFreeShippingThresholdCents(rawThresholds, marketCountry, envThresholdCents);

  const items = useMemo(() => {
    const first =
      thresholdCents != null
        ? [{ text: `Kostenloser Versand ab ${formatPriceCents(thresholdCents)} €`, href: "/shipping" }]
        : [];
    return [...first, ...STATIC_LINKS];
  }, [thresholdCents]);

  return (
    <Bar>
      <Container>
        {items.slice(0, 4).map((item, i) => (
          <Item key={`${item.href}-${i}`} href={item.href || "#"}>
            {item.text}
          </Item>
        ))}
      </Container>
    </Bar>
  );
}
