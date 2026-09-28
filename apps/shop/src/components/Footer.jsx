"use client";

import React, { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { resolveFreeShippingThresholdCents } from "@/lib/free-shipping-threshold";
import { formatPriceCents } from "@/lib/format";
import { menuItemHref } from "@/lib/shop-menu-href";

const FooterContainer = styled.footer`
  background-color: var(--footer-bg, #136761);
  color: var(--footer-text, #ffffff);
  border-top: var(--footer-border, none);
  padding: 56px 0 calc(28px + env(safe-area-inset-bottom, 0px));
  margin-top: auto;

  @media (max-width: 767px) {
    margin-top: 0;
    padding: 28px 0 calc(24px + env(safe-area-inset-bottom, 0px));
  }
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  @media (max-width: 767px) {
    padding: 0 20px;
  }
`;

const Top = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) repeat(${(p) => p.$columns || 4}, minmax(0, 1fr));
  gap: 40px;
  padding-bottom: 36px;

  @media (max-width: 1023px) {
    grid-template-columns: repeat(${(p) => Math.min(p.$columns || 4, 4)}, minmax(0, 1fr));
    gap: 32px;
  }
  @media (max-width: 767px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px 16px;
    padding-bottom: 24px;
  }
`;

const Brand = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  @media (max-width: 1023px) {
    grid-column: 1 / -1;
  }
`;

const Wordmark = styled(Link)`
  font-family: var(--h2-ff, inherit);
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--footer-text, #ffffff);
  text-decoration: none;
  &:hover {
    color: var(--footer-text, #ffffff);
    opacity: 0.9;
  }
`;

const Column = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  @media (max-width: 767px) {
    gap: 10px;
  }
`;

const Title = styled.h3`
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 4px;
  color: var(--footer-text, #ffffff);

  @media (max-width: 767px) {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--shop-primary, #ffffff);
    margin: 0;
  }
`;

const FooterLink = styled(Link)`
  color: var(--footer-text, #ffffff);
  font-size: 14px;
  line-height: 1.4;
  opacity: 0.85;
  text-decoration: none;
  transition: opacity 0.2s ease, color 0.2s ease;
  overflow-wrap: anywhere;

  &:hover {
    color: var(--footer-text, #ffffff);
    opacity: 1;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;

const Placeholder = styled.div`
  color: var(--footer-text, #ffffff);
  opacity: 0.7;
  font-size: 14px;
`;

const Bottom = styled.div`
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  padding-top: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
`;

const BottomLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 200px;
`;

const ShippingPromo = styled.span`
  color: var(--footer-text, #ffffff);
  font-size: 14px;
  line-height: 1.4;
  opacity: 0.95;
`;

const Copyright = styled.p`
  color: var(--footer-text, #ffffff);
  opacity: 0.8;
  font-size: 13px;
  margin: 0;
`;

const FOOTER_LOCATIONS = ["footer1", "footer2", "footer3", "footer4"];

export default function Footer() {
  const locale = useLocale();
  const prefix = useMarketPrefix();
  const marketCountry = (prefix?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const envThresholdCents =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS
      ? Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS)
      : null;

  const [footerColumns, setFooterColumns] = useState([]);
  const [rawThresholds, setRawThresholds] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/store-menus?locale=${encodeURIComponent(locale)}`).then((r) => r.json()),
      fetch("/api/store-seller-settings").then((r) => r.json()),
    ])
      .then(([menuData, sellerData]) => {
        const menus = menuData.menus || [];
        const columns = FOOTER_LOCATIONS.map((loc) => {
          const menu = menus.find((m) => (m.location || "").toLowerCase().trim() === loc.toLowerCase());
          if (!menu) return { location: loc, menu: null, items: [] };
          const items = (menu.items || []).filter((i) => !i.parent_id);
          return { location: loc, menu, items };
        });
        setFooterColumns(columns);

        if (sellerData?.free_shipping_thresholds && typeof sellerData.free_shipping_thresholds === "object") {
          setRawThresholds(sellerData.free_shipping_thresholds);
        } else if (sellerData?.free_shipping_threshold_cents != null) {
          setRawThresholds({ DE: sellerData.free_shipping_threshold_cents });
        } else {
          setRawThresholds(null);
        }
      })
      .catch(() => {
        setFooterColumns([]);
        setRawThresholds(null);
      });
  }, [locale]);

  const thresholdCents = resolveFreeShippingThresholdCents(rawThresholds, marketCountry, envThresholdCents);
  const shippingPromoText = null; /* temporarily hidden — re-enable when ready */

  return (
    <FooterContainer className="site-footer">
      <Container>
        <Top $columns={footerColumns.length || 4}>
          <Brand>
            <Wordmark href="/">Andertal</Wordmark>
          </Brand>
          {footerColumns.map(({ location, menu, items }) => (
            <Column key={location} aria-label={menu?.name || undefined}>
              <Title>{menu?.name || " "}</Title>
              {items.length > 0 ? (
                items.map((item) => (
                  <FooterLink key={item.id} href={menuItemHref(item)}>{item.label}</FooterLink>
                ))
              ) : (
                menu ? <Placeholder>Keine Einträge</Placeholder> : null
              )}
            </Column>
          ))}
        </Top>
        <Bottom>
          <BottomLeft>
            {shippingPromoText && (
              <ShippingPromo>{shippingPromoText}</ShippingPromo>
            )}
            <Copyright>© {new Date().getFullYear()} Andertal</Copyright>
          </BottomLeft>
        </Bottom>
      </Container>
    </FooterContainer>
  );
}

