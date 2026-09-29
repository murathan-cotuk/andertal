"use client";

import React, { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useShopStyles } from "@/context/ShopStylesContext";
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
  padding: 48px 0 calc(20px + env(safe-area-inset-bottom, 0px));
  margin-top: auto;

  @media (max-width: 767px) {
    margin-top: 0;
    padding: 28px 0 calc(24px + env(safe-area-inset-bottom, 0px));
  }
`;

const Container = styled.div`
  max-width: 1360px;
  margin: 0 auto;
  padding: 0 24px;
  @media (max-width: 767px) {
    padding: 0 20px;
  }
`;

const Top = styled.div`
  display: grid;
  grid-template-columns: 300px repeat(${(p) => p.$columns || 4}, minmax(0, 1fr));
  gap: 32px 48px;
  padding-bottom: 32px;
  margin-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);

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
  gap: 16px;
  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    opacity: 0.8;
    max-width: 300px;
  }
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

const Socials = styled.div`
  display: flex;
  gap: 8px;
  a {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;
  }
  a:hover {
    background: var(--shop-primary, #ee8a12);
    color: #1d1b18;
  }
`;

const MarketBtn = styled.button`
  height: 36px;
  padding: 0 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: none;
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  &:hover {
    border-color: rgba(255, 255, 255, 0.5);
  }
`;

const Placeholder = styled.div`
  color: var(--footer-text, #ffffff);
  opacity: 0.7;
  font-size: 14px;
`;

const Bottom = styled.div`
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

const SOCIAL_ICONS = {
  instagram: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  ),
  facebook: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" />
    </svg>
  ),
  tiktok: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.5 2.5 4 5 4" />
    </svg>
  ),
};

const LANGUAGE_NAMES = { de: "Deutsch", en: "English", fr: "Français", it: "Italiano", es: "Español", tr: "Türkçe" };

function regionName(code, locale) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

export default function Footer() {
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const styles = useShopStyles();
  const footerStyles = styles?.footer || {};
  const socials = ["instagram", "facebook", "tiktok"]
    .map((k) => ({ k, url: String(footerStyles[`${k}_url`] || "").trim() }))
    .filter((x) => /^https?:\/\//i.test(x.url));
  const tagline = String(footerStyles.tagline || "").trim() || tCommon("footerTagline");
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
            {tagline ? <p>{tagline}</p> : null}
            {socials.length > 0 ? (
              <Socials>
                {socials.map(({ k, url }) => (
                  <a key={k} href={url} target="_blank" rel="noopener noreferrer" aria-label={k[0].toUpperCase() + k.slice(1)}>
                    {SOCIAL_ICONS[k]}
                  </a>
                ))}
              </Socials>
            ) : null}
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
          <MarketBtn
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              window.scrollTo({ top: 0, behavior: "smooth" });
              window.dispatchEvent(new CustomEvent("andertal:open-locale"));
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
            </svg>
            {regionName(marketCountry, locale)} · {LANGUAGE_NAMES[locale] || String(locale).toUpperCase()}
          </MarketBtn>
        </Bottom>
      </Container>
    </FooterContainer>
  );
}

