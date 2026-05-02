"use client";

import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/context/CartContext";
import { formatPriceCents, getLocalizedCartLineTitle } from "@/lib/format";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useShippingCountryForQuotes } from "@/hooks/useShippingCountryForQuotes";
import { resolveFreeShippingThresholdCents } from "@/lib/free-shipping-threshold";
import { findShippingGroup, resolveShippingQuoteCents } from "@/lib/shipping-price";
import BestsellerBadge from "@/components/BestsellerBadge";
import { isBestsellerMetadata } from "@/lib/bestseller";

/* Above ShopHeader (2147483600) but below MobileNav bar (2147483640) so bar stays visible */
const CART_Z_OVERLAY = 2147483636;
const CART_Z_DRAWER = 2147483637;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: ${CART_Z_OVERLAY};
  opacity: ${(p) => (p.$open ? 1 : 0)};
  pointer-events: ${(p) => (p.$open ? "auto" : "none")};
  transition: opacity var(--app-duration-surface, 0.3s) var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Drawer = styled.aside`
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  max-width: 100vw;
  height: 100vh;
  background: #fff;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  z-index: ${CART_Z_DRAWER};
  display: flex;
  flex-direction: column;
  transform: translateX(${(p) => (p.$open ? 0 : "100%")});
  transition: transform var(--app-duration-surface, 0.3s) var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (max-width: 1023px) {
    height: calc(100vh - 60px - env(safe-area-inset-bottom, 0px));
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
`;

const CloseBtn = styled.button`
  background: #111827;
  border: none;
  padding: 0;
  width: 32px;
  height: 32px;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  border-radius: 50%;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
  &:hover {
    background: #000;
  }
`;

const Scroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;

  @media (max-width: 767px) {
    overflow-y: hidden;
    overscroll-behavior: contain;
  }
`;

const Item = styled.div`
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
  &:last-child {
    border-bottom: none;
  }
`;

const ItemImage = styled.div`
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #f3f4f6;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #fff;
  }
`;

const ItemBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const RemoveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  align-self: flex-start;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
  &:hover:not(:disabled) {
    color: #ef4444;
    background: #fef2f2;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ItemTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 4px;
  line-height: 1.3;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ItemPrice = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 8px;
`;

const QtyRow = styled.div`
  display: inline-flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f3f4f6;
  overflow: hidden;
`;

const QtyBtn = styled.button`
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  &:hover:not(:disabled) {
    background: #e5e7eb;
    color: #111827;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const QtyInput = styled.input`
  width: 36px;
  height: 28px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  border: 0;
  background: transparent;
  outline: none;
  min-width: 0;
  padding: 0 2px;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  &[type="number"] { -moz-appearance: textfield; }
  &:disabled { opacity: 0.5; }
`;

function QtyInputCell({ itemId, quantity, disabled, onUpdate }) {
  const [draft, setDraft] = useState(String(quantity));
  useEffect(() => { setDraft(String(quantity)); }, [quantity]);
  const commit = () => {
    const val = parseInt(draft, 10);
    if (!isNaN(val) && val >= 1 && val !== quantity) onUpdate(itemId, val);
    else setDraft(String(quantity));
  };
  return (
    <QtyInput
      type="number"
      min="1"
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

const Footer = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
  background: #fff;

  @media (max-width: 767px) {
    position: sticky;
    bottom: 0;
    z-index: 2;
  }
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.875rem;
  color: #4b5563;
`;
const RowTotal = styled(Row)`
  font-weight: 600;
  font-size: 1rem;
  color: #1f2937;
  margin-top: 12px;
  margin-bottom: 16px;
`;

const PrimaryBtn = styled.a`
  display: block;
  text-align: center;
  padding: 12px 20px;
  background: #ff971c;
  color: #fff;
  font-weight: 600;
  font-size: 0.9375rem;
  border-radius: 8px;
  text-decoration: none;
  margin-bottom: 12px;
  &:hover {
    background: #e65f00;
    color: #fff;
  }
`;

/** Mobilde (≤767px) en üstte “Kasse” — alttaki tekrar etmesin */
const MobileTopCheckout = styled.div`
  display: none;
  flex-shrink: 0;
  padding: 12px 20px 14px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;

  @media (max-width: 767px) {
    display: block;
  }
`;

const MobileTopCheckoutBtn = styled(PrimaryBtn)`
  margin-bottom: 0;
`;

const FooterPrimaryBtn = styled(PrimaryBtn)`
  @media (max-width: 767px) {
    display: none;
  }
`;

const TextLink = styled(Link)`
  display: block;
  text-align: center;
  font-size: 0.875rem;
  color: #1a1a1a;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Empty = styled.p`
  text-align: center;
  color: #6b7280;
  font-size: 0.9375rem;
  padding: 32px 16px;
  margin: 0;
`;

const RecommendedWrap = styled.div`
  margin-top: 8px;
`;

const RecommendedTitle = styled.h3`
  margin: 0 0 10px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #1f2937;
`;

/** Arama panelindeki „Weiter einkaufen“ ile aynı mantık: yatay kaydırmalı kart şeridi */
const RecommendedStrip = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
  padding: 0 0 14px;
  margin-left: -20px;
  margin-right: -20px;
  padding-left: 20px;
  padding-right: 20px;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 999px;
  }
`;

const RecommendedCard = styled.div`
  flex: 0 0 calc(50% - 5px);
  min-width: calc(50% - 5px);
  max-width: calc(50% - 5px);
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  padding: 10px;
  border: 1px solid #eceff3;
  border-radius: 12px;
  background: #fff;
  box-sizing: border-box;
`;

const RecommendedThumb = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #f3f4f6;
  margin-bottom: 8px;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const RecommendedItemLink = styled(Link)`
  display: block;
  min-width: 0;
  text-decoration: none;
  color: inherit;
  flex: 1;
`;

const RecommendedName = styled.div`
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  color: #111827;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 4px;
`;

const RecommendedPrice = styled.div`
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 8px;
`;

const QuickAddBtn = styled.button`
  width: 100%;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: #ff971c;
  color: #fff;
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  margin-top: auto;
  -webkit-tap-highlight-color: transparent;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ENV_THRESHOLD_CENTS = typeof process !== "undefined" && process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS
  ? Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS)
  : null;

function useShippingThresholds() {
  const [thresholds, setThresholds] = useState(null);
  useEffect(() => {
    fetch("/api/store-seller-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.free_shipping_thresholds && typeof d.free_shipping_thresholds === "object") {
          setThresholds(d.free_shipping_thresholds);
        } else if (d?.free_shipping_threshold_cents != null) {
          setThresholds({ DE: d.free_shipping_threshold_cents });
        }
      })
      .catch(() => {});
  }, []);
  return thresholds;
}

function calcShipping(items, shippingGroups, country = "DE") {
  let maxCents = null;
  for (const item of items) {
    const groupId =
      item.shipping_group_id ||
      item.metadata?.shipping_group_id ||
      item.variant?.product?.metadata?.shipping_group_id ||
      item.product?.metadata?.shipping_group_id;
    if (!groupId) continue;
    const group = findShippingGroup(shippingGroups, groupId);
    if (!group?.prices || typeof group.prices !== "object") continue;
    const priceCents = resolveShippingQuoteCents(group.prices, country);
    if (priceCents == null) continue;
    if (maxCents === null || priceCents > maxCents) maxCents = priceCents;
  }
  return maxCents;
}

export default function CartSidebar() {
  const locale = useLocale();
  const tCart = useTranslations("cart");
  const { cart, sidebarOpen, closeCartSidebar, updateLineItem, removeLineItem, addToCart, loading, subtotalCents, bonusDiscountCents, shippingGroups } = useCart();
  const items = cart?.items || [];
  const allThresholds = useShippingThresholds();
  const prefix = useMarketPrefix();
  const marketCountry = (prefix?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const countryCode = useShippingCountryForQuotes(marketCountry);
  const freeShippingThreshold = resolveFreeShippingThresholdCents(allThresholds, marketCountry, ENV_THRESHOLD_CENTS);
  const effectiveTotal = subtotalCents - bonusDiscountCents;
  const shippingCents = calcShipping(items, shippingGroups, countryCode);
  const isFree = freeShippingThreshold != null && effectiveTotal >= freeShippingThreshold;
  const shippingLabel = isFree
    ? tCart("freeShipping")
    : shippingCents != null
      ? `${formatPriceCents(shippingCents)} €`
      : tCart("shipping");
  const [recommended, setRecommended] = useState([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);

  useEffect(() => {
    if (!sidebarOpen || items.length > 0) return;
    let cancelled = false;
    setRecommendedLoading(true);
    fetch("/api/store-products?limit=8")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d?.products) ? d.products : [];
        const mapped = list
          .map((p) => {
            const price =
              Number(p?.variants?.[0]?.calculated_price?.calculated_amount ?? p?.variants?.[0]?.prices?.[0]?.amount ?? 0);
            const v0 = p?.variants?.[0] || {};
            return {
              id: p.id,
              handle: String(p.handle || p.id || "").replace(/^\//, ""),
              title: p.title || "Produkt",
              thumbnail: p.thumbnail || p.images?.[0]?.url || "",
              price,
              variantId: p?.variants?.[0]?.id || "",
              sellerId:
                p?.seller_id ||
                p?.metadata?.seller_id ||
                v0?.seller_id ||
                v0?.metadata?.seller_id ||
                v0?.product?.seller_id ||
                v0?.product?.metadata?.seller_id ||
                null,
            };
          })
          .filter((p) => p.handle && p.variantId)
          .slice(0, 8);
        setRecommended(mapped);
      })
      .catch(() => {
        if (!cancelled) setRecommended([]);
      })
      .finally(() => {
        if (!cancelled) setRecommendedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sidebarOpen, items.length]);

  return (
    <>
      <Overlay $open={sidebarOpen} onClick={closeCartSidebar} aria-hidden="true" />
      <Drawer $open={sidebarOpen} role="dialog" aria-label="Warenkorb">
        <Header>
          <Title>Warenkorb</Title>
          <CloseBtn type="button" onClick={closeCartSidebar} aria-label="Schließen">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </CloseBtn>
        </Header>
        {items.length > 0 && (
          <MobileTopCheckout>
            <MobileTopCheckoutBtn href="/cart" onClick={closeCartSidebar}>
              Zur Kasse
            </MobileTopCheckoutBtn>
          </MobileTopCheckout>
        )}
        <Scroll>
          {items.length === 0 && !loading && (
            <>
              <Empty>Ihr Warenkorb ist leer.</Empty>
              <RecommendedWrap>
                <RecommendedTitle>Empfohlene Produkte</RecommendedTitle>
                {recommendedLoading && <div style={{ color: "#9ca3af", fontSize: 13 }}>Wird geladen...</div>}
                {!recommendedLoading && recommended.length === 0 && (
                  <div style={{ color: "#9ca3af", fontSize: 13 }}>Keine Empfehlungen verfügbar.</div>
                )}
                {!recommendedLoading && recommended.length > 0 && (
                  <RecommendedStrip role="region" aria-label="Empfohlene Produkte">
                    {recommended.map((p) => (
                      <RecommendedCard key={p.id}>
                        <RecommendedItemLink href={`/produkt/${p.handle}`} onClick={closeCartSidebar}>
                          <RecommendedThumb>
                            {p.thumbnail ? (
                              <img src={p.thumbnail} alt={p.title} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", background: "#e5e7eb" }} />
                            )}
                          </RecommendedThumb>
                          <RecommendedName>{p.title}</RecommendedName>
                          <RecommendedPrice>{formatPriceCents(p.price)}</RecommendedPrice>
                        </RecommendedItemLink>
                        <QuickAddBtn
                          type="button"
                          title="Schnell hinzufügen"
                          aria-label="Schnell hinzufügen"
                          disabled={loading}
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            let out = await addToCart(p.variantId, 1, p.sellerId || null);
                            if (!out && p.sellerId) out = await addToCart(p.variantId, 1, null);
                          }}
                        >
                          +
                        </QuickAddBtn>
                      </RecommendedCard>
                    ))}
                  </RecommendedStrip>
                )}
              </RecommendedWrap>
            </>
          )}
          {items.map((item) => (
            <Item key={item.id}>
              <ItemImage>
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={getLocalizedCartLineTitle(item, locale)} />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "#e5e7eb" }} />
                )}
              </ItemImage>
              <ItemBody>
                <ItemTitle>
                  <Link
                    href={item.product_handle ? `/produkt/${item.product_handle}` : "/"}
                    onClick={closeCartSidebar}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {getLocalizedCartLineTitle(item, locale) || "Artikel"}
                  </Link>
                  {isBestsellerMetadata(item?.product_metadata || {}) && (
                    <BestsellerBadge style={{ marginLeft: 8, verticalAlign: "middle" }} />
                  )}
                </ItemTitle>
                <ItemPrice>{formatPriceCents(item.unit_price_cents || 0)}</ItemPrice>
                <QtyRow>
                  <QtyBtn
                    type="button"
                    disabled={loading || (item.quantity || 0) <= 1}
                    onClick={() => updateLineItem(item.id, Math.max(1, (item.quantity || 1) - 1))}
                    aria-label="Menge verringern"
                  >
                    −
                  </QtyBtn>
                  <QtyInputCell
                    itemId={item.id}
                    quantity={item.quantity || 1}
                    disabled={loading}
                    onUpdate={updateLineItem}
                  />
                  <QtyBtn
                    type="button"
                    disabled={loading}
                    onClick={() => updateLineItem(item.id, (item.quantity || 0) + 1)}
                    aria-label="Menge erhöhen"
                  >
                    +
                  </QtyBtn>
                </QtyRow>
              </ItemBody>
              <RemoveBtn
                type="button"
                onClick={() => removeLineItem(item.id)}
                disabled={loading}
                aria-label="Aus Warenkorb entfernen"
                title="Entfernen"
              >
                ×
              </RemoveBtn>
            </Item>
          ))}
        </Scroll>
        {items.length > 0 && (
          <Footer>
            <Row>
              <span>Zwischensumme</span>
              <span>{formatPriceCents(subtotalCents)}</span>
            </Row>
            {bonusDiscountCents > 0 && (
              <Row style={{ color: "#16a34a" }}>
                <span>Bonusrabatt</span>
                <span>−{formatPriceCents(bonusDiscountCents)} €</span>
              </Row>
            )}
            <Row>
              <span>Versand</span>
              <span style={{ color: effectiveTotal >= (freeShippingThreshold ?? Infinity) ? "#16a34a" : undefined }}>{shippingLabel}</span>
            </Row>
            <RowTotal>
              <span>Gesamt</span>
              <span>{formatPriceCents(Math.max(0, subtotalCents - bonusDiscountCents + (isFree || shippingCents === null ? 0 : shippingCents)))} €</span>
            </RowTotal>
            <FooterPrimaryBtn href="/cart" onClick={closeCartSidebar}>
              Zur Kasse
            </FooterPrimaryBtn>
            <TextLink href="/cart" onClick={closeCartSidebar}>
              Warenkorb anzeigen
            </TextLink>
          </Footer>
        )}
      </Drawer>
    </>
  );
}
