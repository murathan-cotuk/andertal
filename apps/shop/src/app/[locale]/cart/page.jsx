"use client";

import React from "react";
import styled from "styled-components";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { formatPriceCents } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import { tokens } from "@/design-system/tokens";

const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${tokens.background.main};
  padding-top: calc(${tokens.navbar.height} + ${tokens.topBar.height});
`;

const Main = styled.main`
  flex: 1;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  padding: 40px 24px 64px;
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
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
`;

const ItemPrice = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 12px;
`;

const QtyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const QtyBtn = styled.button`
  width: 32px;
  height: 32px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  color: #374151;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover:not(:disabled) { background: #f9fafb; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const QtyVal = styled.span`
  font-size: 0.9375rem;
  font-weight: 500;
  min-width: 28px;
  text-align: center;
`;

const RemoveBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  padding: 4px;
  font-size: 13px;
  margin-left: auto;
  align-self: flex-start;
  flex-shrink: 0;
  &:hover { color: #ef4444; }
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

const CheckoutBtn = styled(Link)`
  display: block;
  text-align: center;
  padding: 14px 20px;
  background: ${tokens.primary.DEFAULT};
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  border-radius: 8px;
  text-decoration: none;
  &:hover { background: ${tokens.primary.hover}; }
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

const EmptyState = styled.div`
  text-align: center;
  padding: 80px 24px;
  color: #6b7280;
`;

export default function CartPage() {
  const t = useTranslations("cart");
  const { cart, loading, updateLineItem, removeLineItem, subtotalCents } = useCart();
  const items = cart?.items || [];

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Title>{t("title")}</Title>
        {items.length === 0 ? (
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
                      <img src={resolveImageUrl(item.thumbnail)} alt={item.title || ""} />
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
                          const raw = item.title || "";
                          const m = raw.match(/^(.*)\s+\((.+)\)$/);
                          return m ? m[1] : raw;
                        })()}
                      </Link>
                    </ItemTitle>
                    {(() => {
                      const raw = item.title || "";
                      const m = raw.match(/^(.*)\s+\((.+)\)$/);
                      return m ? <span style={{ fontSize: 12, color: "#6b7280", display: "block", marginTop: 2 }}>{m[2]}</span> : null;
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
                      <QtyVal>{item.quantity || 0}</QtyVal>
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
                    >
                      <i className="fas fa-times" />
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
              <SummaryRow>
                <span>{t("shippingLabel")}</span>
                <span>{t("shipping")}</span>
              </SummaryRow>
              <SummaryTotal>
                <span>{t("total")}</span>
                <span>{formatPriceCents(subtotalCents)} €</span>
              </SummaryTotal>
              <CheckoutBtn href="/checkout">{t("checkout")}</CheckoutBtn>
              <ContinueLink href="/">Weiter einkaufen</ContinueLink>
            </SummaryCard>
          </Layout>
        )}
      </Main>
      <Footer />
    </PageWrap>
  );
}
