"use client";

import React, { useState, useEffect, useMemo } from "react";
import styled from "styled-components";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { formatPriceCents, getLocalizedCartLineTitle } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import { tokens } from "@/design-system/tokens";
import PayNowButton from "@/components/ui/PayNowButton";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useShippingCountryForQuotes } from "@/hooks/useShippingCountryForQuotes";
import { computeSellerShipping, useSellerFreeShippingThresholds, groupCartBySeller } from "@/lib/seller-shipping";
import { storefrontProductHandle } from "@/lib/product-url-handle";

const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--shop-bg, #f6f2ec);
`;

const Main = styled.main`
  flex: 1;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  padding: 24px 24px 64px;

  @media (max-width: 768px) {
    padding: 16px 16px 56px;
  }
`;

const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  color: #1d1b18;
  margin: 0 0 32px;

  @media (max-width: 768px) {
    font-size: 1.375rem;
    margin-bottom: 20px;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 32px;
  align-items: flex-start;

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
`;

const ItemsColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
`;

/** One card per seller (sender): header, the seller's own lines, then that seller's shipping. */
const ItemsSection = styled.section`
  background: #fff;
  border: 1px solid #efe8dd;
  border-radius: 20px;
  overflow: hidden;
`;

const SellerHead = styled.header`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: #faf7f2;
  border-bottom: 1px solid #f3eee6;
  .label { font-size: 12px; color: #5e574e; }
  .name { font-size: 15px; font-weight: 700; color: #1d1b18; }
`;

const SellerFoot = styled.footer`
  padding: 12px 20px 14px;
  border-top: 1px solid #f3eee6;
  background: #faf7f2;
  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    color: #5e574e;
  }
  .row strong { color: #1d1b18; font-variant-numeric: tabular-nums; }
  .row strong.free { color: #16a34a; }
  .hint { margin-top: 6px; font-size: 13px; font-weight: 600; color: #a65300; }
  .track { margin-top: 6px; height: 5px; border-radius: 3px; background: #efe8dd; overflow: hidden; }
  .fill { height: 100%; border-radius: 3px; background: var(--shop-primary, #ee8a12); }
`;

const ItemRow = styled.div`
  display: flex;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid #f3eee6;
  &:last-child { border-bottom: none; }
`;

const Thumb = styled.div`
  position: relative;
  width: 88px;
  height: 88px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #f3eee6;
  img { width: 100%; height: 100%; object-fit: contain; background: #fff; display: block; }
`;

const ItemDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemTitle = styled.div`
  font-size: 0.9375rem;
  font-weight: 500;
  color: #1d1b18;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ItemPrice = styled.div`
  font-size: 0.875rem;
  color: #5e574e;
  margin-bottom: 12px;
`;

const QtyRow = styled.div`
  display: inline-flex;
  align-items: center;
  border: 1px solid #d6ccbd;
  border-radius: 8px;
  background: #f3eee6;
  overflow: hidden;
`;

const QtyBtn = styled.button`
  width: 34px;
  height: 34px;
  border: 0;
  background: transparent;
  color: #5e574e;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  &:hover:not(:disabled) { background: #e6dfd4; color: #1d1b18; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const QtyInput = styled.input`
  width: 44px;
  height: 34px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #3a352f;
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
  color: #5e574e;
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
  color: #1d1b18;
  text-align: right;
  white-space: nowrap;
`;

const SummaryCard = styled.div`
  background: #fff;
  border: 1px solid #e6dfd4;
  border-radius: 12px;
  padding: 18px 20px;
  position: sticky;
  top: 64px;

  @media (max-width: 768px) {
    position: relative;
    top: auto;
    padding: 18px 16px 20px;
    border-radius: 0;
    border-left: none;
    border-right: none;
    box-shadow: none;
    margin-left: -16px;
    margin-right: -16px;
    width: calc(100% + 32px);
    background: #fff;
    color: #1d1b18;
  }
`;

const SummaryHeading = styled.h2`
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #1d1b18;
  margin: 0 0 14px;
  line-height: 1.3;

  @media (min-width: 769px) {
    font-size: 1.0625rem;
    font-weight: 700;
    margin-bottom: 12px;
  }
`;

/** Mobilde Zwischensumme / Versand satırlarını tek görsel blokta toplar */
const SummaryLines = styled.div`
  @media (max-width: 768px) {
    background: #f3eee6;
    border-radius: 12px;
    padding: 2px 14px;
    margin-bottom: 14px;
  }
`;

const SummaryRowLine = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 18px;
  align-items: baseline;
  font-size: 0.9375rem;
  color: #5e574e;

  @media (max-width: 768px) {
    padding: 9px 0;
    &:not(:last-child) {
      border-bottom: 1px solid rgba(17, 24, 39, 0.08);
    }
  }

  @media (min-width: 769px) {
    padding: 0;
    margin-bottom: 6px;
    &:last-child {
      margin-bottom: 0;
    }
  }
`;

const SummaryAmount = styled.span`
  font-weight: 600;
  color: #1d1b18;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
`;

const SummaryTotalBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  margin-bottom: 18px;
  border-radius: 12px;
  border: 1px solid #e8eaee;
  background: linear-gradient(180deg, #faf7f2 0%, #f4f5f7 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);

  @media (min-width: 769px) {
    margin-top: 10px;
    padding: 12px 0 14px;
    margin-bottom: 14px;
    border-radius: 0;
    border: none;
    border-top: 1px solid #e6dfd4;
    background: transparent;
    box-shadow: none;
  }
`;

const SummaryTotalLabel = styled.span`
  font-size: 1rem;
  font-weight: 700;
  color: #1d1b18;
`;

const SummaryTotalAmount = styled.span`
  font-size: 1.125rem;
  font-weight: 700;
  color: #1d1b18;
  font-variant-numeric: tabular-nums;
`;

const ContinueLink = styled(Link)`
  display: block;
  text-align: center;
  font-size: 0.875rem;
  color: #5e574e;
  text-decoration: none;
  margin-top: 12px;
  &:hover { color: #3a352f; text-decoration: underline; }
`;

const ClearCartBtn = styled.button`
  width: 100%;
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #e6dfd4;
  background: #fff;
  color: #5e574e;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover:not(:disabled) {
    background: #faf7f2;
    color: #1d1b18;
    border-color: #d6ccbd;
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 80px 24px;
  color: #5e574e;
`;

export default function CartPage() {
  const tUi = useTranslations("shopUi");
  const t = useTranslations("cart");
  const tAccount = useTranslations("pages.account");
  const locale = useLocale();
  const { cart, loading, updateLineItem, removeLineItem, clearCart, subtotalCents, bonusDiscountCents, shippingGroups } = useCart();
  const items = cart?.items || [];
  const prefix = useMarketPrefix();
  const marketCountry = (prefix?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const countryCode = useShippingCountryForQuotes(marketCountry);

  // Kargo: her satıcının kendi versandgruppe fiyatı + kendi ücretsiz kargo eşiği; toplam = satıcıların toplamı
  const sellerThresholds = useSellerFreeShippingThresholds(items);
  const sellerShipping = useMemo(
    () => computeSellerShipping(items, shippingGroups, sellerThresholds, countryCode),
    [items, shippingGroups, sellerThresholds, countryCode],
  );
  const shippingCents = sellerShipping.totalCents;
  const isFree = sellerShipping.anyPriced && shippingCents === 0;
  // Cart grouped by seller (sender), in the order the sellers first appear in the cart; each
  // group carries its own shipping quote (lib/seller-shipping.js — same rule the backend charges).
  const sellerGroups = useMemo(
    () => groupCartBySeller(items, sellerShipping).map((g) => ({
      ...g,
      name: g.name || (g.sellerId === "default" ? tUi("sellerShippingMarketplace") : t("sellerFallback")),
    })),
    [items, sellerShipping, t, tUi],
  );
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
          <GlobalPageLoader />
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
                borderRadius: 999,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {tAccount("continueShopping")}
            </Link>
          </EmptyState>
        ) : (
          <Layout>
            <ItemsColumn>
            {sellerGroups.map((g) => (
            <ItemsSection key={g.sellerId} aria-label={g.name}>
              <SellerHead>
                <span>
                  <span className="label">{t("sellerHeading")}: </span>
                  <span className="name">{g.name}</span>
                </span>
              </SellerHead>
              {g.items.map((item) => (
                <ItemRow key={item.id}>
                  <Thumb>
                    {item.thumbnail ? (
                      <img src={resolveImageUrl(item.thumbnail)} alt={getLocalizedCartLineTitle(item, locale)} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "#e6dfd4" }} />
                    )}
                  </Thumb>
                  <ItemDetails>
                    <ItemTitle>
                      <Link
                        href={(() => {
                          const url = storefrontProductHandle(
                            { id: item.product_id, handle: item.product_handle, metadata: item.product_metadata },
                            locale,
                          );
                          return url ? `/${url}` : "/";
                        })()}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {(() => {
                          const lineTitle = getLocalizedCartLineTitle(item, locale);
                          const m = lineTitle.match(/^(.*)\s+\((.+)\)$/);
                          return m ? m[1] : lineTitle;
                        })()}
                      </Link>
                    </ItemTitle>
                    {(() => {
                      const lineTitle = getLocalizedCartLineTitle(item, locale);
                      const m = lineTitle.match(/^(.*)\s+\((.+)\)$/);
                      if (!m || !m[2]) return null;
                      const parts = m[2].split(/\s*\/\s*/).filter(Boolean);
                      return (
                        <span style={{ fontSize: 12, color: "#5e574e", display: "block", marginTop: 4, lineHeight: 1.4 }}>
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
              {g.shipping ? (
                <SellerFoot>
                  <div className="row">
                    <span>{t("shippingLabel")}</span>
                    {g.shipping.free ? (
                      <strong className="free">{t("freeShipping")}</strong>
                    ) : g.shipping.baseCents != null ? (
                      <strong>{formatPriceCents(g.shipping.shippingCents)} €</strong>
                    ) : (
                      <strong style={{ fontWeight: 500, color: "#5e574e" }}>{t("shipping")}</strong>
                    )}
                  </div>
                  {g.shipping.remainingCents != null && g.shipping.remainingCents > 0 && g.shipping.shippingCents > 0 ? (
                    <>
                      <div className="hint">
                        {tUi("sellerFreeShippingHint", { amount: formatPriceCents(g.shipping.remainingCents), seller: g.name })}
                      </div>
                      <div className="track" aria-hidden="true">
                        <div
                          className="fill"
                          style={{ width: `${Math.min(100, Math.max(0, Math.round((g.shipping.subtotalCents / g.shipping.thresholdCents) * 100)))}%` }}
                        />
                      </div>
                    </>
                  ) : null}
                </SellerFoot>
              ) : null}
            </ItemsSection>
            ))}
            </ItemsColumn>

            <SummaryCard>
              <SummaryHeading>{t("summaryTitle")}</SummaryHeading>
              <SummaryLines>
                <SummaryRowLine>
                  <span>{t("subtotal")}</span>
                  <SummaryAmount>{formatPriceCents(subtotalCents)} €</SummaryAmount>
                </SummaryRowLine>
                {bonusDiscountCents > 0 && (
                  <SummaryRowLine style={{ color: "#15803d" }}>
                    <span>{tUi("bonusDiscount")}</span>
                    <SummaryAmount style={{ color: "#16a34a" }}>
                      −{formatPriceCents(bonusDiscountCents)} €
                    </SummaryAmount>
                  </SummaryRowLine>
                )}
                <SummaryRowLine>
                  <span>{t("shippingLabel")}</span>
                  <SummaryAmount
                    style={{
                      color: isFree ? "#16a34a" : undefined,
                      fontWeight: isFree ? 700 : 600,
                    }}
                  >
                    {shippingLabel}
                  </SummaryAmount>
                </SummaryRowLine>
              </SummaryLines>
              <SummaryTotalBar>
                <SummaryTotalLabel>{t("total")}</SummaryTotalLabel>
                <SummaryTotalAmount>
                  {formatPriceCents(Math.max(0, subtotalCents - bonusDiscountCents + (isFree || shippingCents === null ? 0 : shippingCents)))}{" "}
                  €
                </SummaryTotalAmount>
              </SummaryTotalBar>
              <PayNowButton href="/checkout">{t("checkout")}</PayNowButton>
              <ContinueLink href="/">{tUi("continueShopping")}</ContinueLink>
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
