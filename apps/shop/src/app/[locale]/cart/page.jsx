"use client";

import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import NewtonsCradle from "@/components/NewtonsCradle";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { formatPriceCents, getLocalizedCartLineTitle } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import { tokens } from "@/design-system/tokens";
import PayNowButton from "@/components/ui/PayNowButton";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useShippingCountryForQuotes } from "@/hooks/useShippingCountryForQuotes";
import { resolveFreeShippingThresholdCents } from "@/lib/free-shipping-threshold";
import { findShippingGroup, resolveShippingQuoteCents } from "@/lib/shipping-price";
import BestsellerBadge from "@/components/BestsellerBadge";
import { isBestsellerMetadata } from "@/lib/bestseller";

const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${tokens.background.main};
`;

const Main = styled.main`
  flex: 1;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  padding: 24px 24px 64px;
`;

const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 32px;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 32px;
  align-items: flex-start;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ItemsSection = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
`;

const ItemRow = styled.div`
  display: flex;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid #f3f4f6;
  &:last-child { border-bottom: none; }
`;

const Thumb = styled.div`
  width: 88px;
  height: 88px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #f3f4f6;
  img { width: 100%; height: 100%; object-fit: contain; background: #fff; display: block; }
`;

const ItemDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemTitle = styled.div`
  font-size: 0.9375rem;
  font-weight: 500;
  color: #111827;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ItemPrice = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 12px;
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
  width: 34px;
  height: 34px;
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  &:hover:not(:disabled) { background: #e5e7eb; color: #111827; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const QtyInput = styled.input`
  width: 44px;
  height: 34px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  border: 0;
  background: transparent;
  outline: none;
  min-width: 0;
  padding: 0 4px;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  &[type="number"] { -moz-appearance: textfield; }
  &:disabled { opacity: 0.4; }
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

const RemoveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  font-size: 20px;
  line-height: 1;
  margin-left: auto;
  align-self: flex-start;
  flex-shrink: 0;
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

const ItemTotal = styled.div`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
  text-align: right;
  white-space: nowrap;
`;

const SummaryCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  position: sticky;
  top: 64px;
`;

const SummaryTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 20px;
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.9375rem;
  color: #4b5563;
  margin-bottom: 10px;
`;

const SummaryTotal = styled(SummaryRow)`
  font-weight: 700;
  font-size: 1.0625rem;
  color: #111827;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  margin-bottom: 20px;
`;

const ContinueLink = styled(Link)`
  display: block;
  text-align: center;
  font-size: 0.875rem;
  color: #6b7280;
  text-decoration: none;
  margin-top: 12px;
  &:hover { color: #374151; text-decoration: underline; }
`;

const ClearCartBtn = styled.button`
  width: 100%;
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #6b7280;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover:not(:disabled) {
    background: #f9fafb;
    color: #111827;
    border-color: #d1d5db;
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 80px 24px;
  color: #6b7280;
`;

export default function CartPage() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const { cart, loading, updateLineItem, removeLineItem, clearCart, subtotalCents, bonusDiscountCents, shippingGroups } = useCart();
  const items = cart?.items || [];
  const envThresholdCents = typeof process !== "undefined" && process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS
    ? Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS) : null;
  const [allThresholds, setAllThresholds] = useState(null);
  useEffect(() => {
    fetch("/api/store-seller-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.free_shipping_thresholds && typeof d.free_shipping_thresholds === "object") {
          setAllThresholds(d.free_shipping_thresholds);
        } else if (d?.free_shipping_threshold_cents != null) {
          setAllThresholds({ DE: d.free_shipping_threshold_cents });
        }
      })
      .catch(() => {});
  }, []);
  const prefix = useMarketPrefix();
  const marketCountry = (prefix?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const countryCode = useShippingCountryForQuotes(marketCountry);
  const freeShippingThreshold = resolveFreeShippingThresholdCents(allThresholds, marketCountry, envThresholdCents);
  const effectiveTotal = subtotalCents - bonusDiscountCents;

  // Kargo ücreti: sepetteki ürünlerin versandgruppe fiyatından hesaplanır
  let shippingCents = null;
  for (const item of items) {
    const groupId = item.shipping_group_id || item.metadata?.shipping_group_id || item.variant?.product?.metadata?.shipping_group_id || item.product?.metadata?.shipping_group_id;
    if (!groupId) continue;
    const group = findShippingGroup(shippingGroups, groupId);
    if (!group?.prices || typeof group.prices !== "object") continue;
    const p = resolveShippingQuoteCents(group.prices, countryCode);
    if (p == null) continue;
    if (shippingCents === null || p > shippingCents) shippingCents = p;
  }
  const isFree = freeShippingThreshold != null && effectiveTotal >= freeShippingThreshold;
  const shippingLabel = isFree
    ? t("freeShipping")
    : shippingCents != null
      ? `${formatPriceCents(shippingCents)} €`
      : t("shipping");

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Title>{t("title")}</Title>
        {loading && items.length === 0 ? (
          <NewtonsCradle />
        ) : items.length === 0 ? (
          <EmptyState>
            <p style={{ fontSize: "1.125rem", marginBottom: 24 }}>{t("empty")}</p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: tokens.primary.DEFAULT,
                color: "#fff",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {t("viewCart")}
            </Link>
          </EmptyState>
        ) : (
          <Layout>
            <ItemsSection>
              {items.map((item) => (
                <ItemRow key={item.id}>
                  <Thumb>
                    {item.thumbnail ? (
                      <img src={resolveImageUrl(item.thumbnail)} alt={getLocalizedCartLineTitle(item, locale)} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "#e5e7eb" }} />
                    )}
                  </Thumb>
                  <ItemDetails>
                    <ItemTitle>
                      <Link
                        href={item.product_handle ? `/produkt/${item.product_handle}` : "/"}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {(() => {
                          const lineTitle = getLocalizedCartLineTitle(item, locale);
                          const m = lineTitle.match(/^(.*)\s+\((.+)\)$/);
                          return m ? m[1] : lineTitle;
                        })()}
                      </Link>
                      {isBestsellerMetadata(item?.product_metadata || {}) && <BestsellerBadge />}
                    </ItemTitle>
                    {(() => {
                      const lineTitle = getLocalizedCartLineTitle(item, locale);
                      const m = lineTitle.match(/^(.*)\s+\((.+)\)$/);
                      if (!m || !m[2]) return null;
                      const parts = m[2].split(/\s*\/\s*/).filter(Boolean);
                      return (
                        <span style={{ fontSize: 12, color: "#6b7280", display: "block", marginTop: 4, lineHeight: 1.4 }}>
                          {parts.map((p, i) => (
                            <span key={i} style={{ display: "block" }}>{p.trim()}</span>
                          ))}
                        </span>
                      );
                    })()}
                    <ItemPrice>{formatPriceCents(item.unit_price_cents || 0)} €</ItemPrice>
                    <QtyRow>
                      <QtyBtn
                        type="button"
                        disabled={loading || (item.quantity || 0) <= 1}
                        onClick={() => updateLineItem(item.id, Math.max(1, (item.quantity || 1) - 1))}
                        aria-label={t("decreaseQty")}
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
                        aria-label={t("increaseQty")}
                      >
                        +
                      </QtyBtn>
                    </QtyRow>
                  </ItemDetails>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <RemoveBtn
                      type="button"
                      onClick={() => removeLineItem(item.id)}
                      disabled={loading}
                      aria-label={t("remove")}
                      title={t("remove")}
                    >
                      ×
                    </RemoveBtn>
                    <ItemTotal>
                      {formatPriceCents((item.unit_price_cents || 0) * (item.quantity || 1))} €
                    </ItemTotal>
                  </div>
                </ItemRow>
              ))}
            </ItemsSection>

            <SummaryCard>
              <SummaryTitle>{t("subtotal")}</SummaryTitle>
              <SummaryRow>
                <span>{t("subtotal")}</span>
                <span>{formatPriceCents(subtotalCents)} €</span>
              </SummaryRow>
              {bonusDiscountCents > 0 && (
                <SummaryRow style={{ color: "#16a34a" }}>
                  <span>Bonusrabatt</span>
                  <span>−{formatPriceCents(bonusDiscountCents)} €</span>
                </SummaryRow>
              )}
              <SummaryRow>
                <span>{t("shippingLabel")}</span>
                <span style={{ color: effectiveTotal >= (freeShippingThreshold ?? Infinity) ? "#16a34a" : undefined }}>{shippingLabel}</span>
              </SummaryRow>
              <SummaryTotal>
                <span>{t("total")}</span>
                <span>{formatPriceCents(Math.max(0, subtotalCents - bonusDiscountCents + (isFree || shippingCents === null ? 0 : shippingCents)))} €</span>
              </SummaryTotal>
              <PayNowButton href="/checkout">{t("checkout")}</PayNowButton>
              <ContinueLink href="/">Weiter einkaufen</ContinueLink>
              <ClearCartBtn
                type="button"
                onClick={() => clearCart?.()}
                disabled={loading || items.length === 0}
              >
                Warenkorb leeren
              </ClearCartBtn>
            </SummaryCard>
          </Layout>
        )}
      </Main>
      <Footer />
    </PageWrap>
  );
}
