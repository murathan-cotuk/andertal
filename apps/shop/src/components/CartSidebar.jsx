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
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: #6b7280;
  border-radius: 8px;
  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
`;

const Scroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
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
  const { cart, sidebarOpen, closeCartSidebar, updateLineItem, removeLineItem, loading, subtotalCents, bonusDiscountCents, shippingGroups } = useCart();
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

  return (
    <>
      <Overlay $open={sidebarOpen} onClick={closeCartSidebar} aria-hidden="true" />
      <Drawer $open={sidebarOpen} role="dialog" aria-label="Warenkorb">
        <Header>
          <Title>Warenkorb</Title>
          <CloseBtn type="button" onClick={closeCartSidebar} aria-label="Schließen">
            <i className="fas fa-times" style={{ fontSize: 18 }} />
          </CloseBtn>
        </Header>
        <Scroll>
          {items.length === 0 && !loading && <Empty>Ihr Warenkorb ist leer.</Empty>}
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
            <PrimaryBtn href="/cart" onClick={closeCartSidebar}>
              Zur Kasse
            </PrimaryBtn>
            <TextLink href="/cart" onClick={closeCartSidebar}>
              Warenkorb anzeigen
            </TextLink>
          </Footer>
        )}
      </Drawer>
    </>
  );
}
