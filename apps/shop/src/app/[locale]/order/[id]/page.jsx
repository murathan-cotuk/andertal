"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useTranslations, useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import Footer from "@/components/Footer";
import { formatPriceCents, getLocalizedCartLineTitle } from "@/lib/format";
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
  max-width: 680px;
  margin: 0 auto;
  width: 100%;
  padding: 24px 24px 80px;
  text-align: center;
`;

const SuccessIcon = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: #d1fae5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  font-size: 32px;
  color: #059669;
`;

const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 12px;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
  margin: 0 0 40px;
`;

const Card = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  text-align: left;
  margin-bottom: 24px;
`;

const MetaRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.9375rem;
  color: #4b5563;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
  &:last-child { border-bottom: none; }
`;

const MetaLabel = styled.span`
  font-weight: 500;
  color: #374151;
`;

const ItemRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
  &:last-child { border-bottom: none; }
`;

const Thumb = styled.div`
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #f3f4f6;
  img { width: 100%; height: 100%; object-fit: contain; background: #fff; display: block; }
`;

const ItemTitle = styled.div`
  flex: 1;
  font-size: 0.9375rem;
  font-weight: 500;
  color: #111827;
`;

const ItemMeta = styled.div`
  font-size: 0.8125rem;
  color: #6b7280;
`;

const ItemTotal = styled.div`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
`;

const TotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 1.0625rem;
  font-weight: 700;
  color: #111827;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
`;

const ContinueBtn = styled(Link)`
  display: inline-block;
  padding: 14px 32px;
  background: ${tokens.primary.DEFAULT};
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  border-radius: 8px;
  text-decoration: none;
  margin-top: 16px;
  &:hover { background: ${tokens.primary.hover}; }
`;

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });
}

export default function OrderConfirmationPage() {
  const t = useTranslations("order");
  const locale = useLocale();
  const params = useParams();
  const orderId = params?.id || "";

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orderId) return;
    fetch(`/api/store-orders/${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.order) setOrder(data.order);
        else setError(t("notFound"));
      })
      .catch(() => setError(t("notFound")))
      .finally(() => setLoading(false));
  }, [orderId]);

  const items = Array.isArray(order?.items) ? order.items : [];

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        {loading ? (
          <GlobalPageLoader />
        ) : error ? (
          <p style={{ color: "#ef4444" }}>{error}</p>
        ) : (
          <>
            <SuccessIcon>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </SuccessIcon>
            <Title>{t("confirmationTitle")}</Title>
            <Subtitle>{t("confirmationSubtitle")}</Subtitle>

            <Card>
              <MetaRow>
                <MetaLabel>{t("orderNumber")}</MetaLabel>
                <span style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
                  #{order.order_number || order.id?.slice(0, 8).toUpperCase()}
                </span>
              </MetaRow>
              <MetaRow>
                <MetaLabel>{t("orderDate")}</MetaLabel>
                <span>{formatDate(order.created_at)}</span>
              </MetaRow>
              {order.email && (
                <MetaRow>
                  <MetaLabel>E-Mail</MetaLabel>
                  <span>{order.email}</span>
                </MetaRow>
              )}
              {(String(order.payment_status || "").toLowerCase() === "bezahlt" || order.status === "paid") && (
                <MetaRow>
                  <MetaLabel>{t("paymentStatus")}</MetaLabel>
                  <span style={{ color: "#059669", fontWeight: 600 }}>{t("paid")}</span>
                </MetaRow>
              )}
            </Card>

            {items.length > 0 && (
              <Card>
                <div style={{ fontWeight: 600, color: "#111827", marginBottom: 12, fontSize: "0.9375rem" }}>
                  {t("items")}
                </div>
                {items.map((item, i) => (
                  <ItemRow key={item.id || i}>
                    <Thumb>
                      {item.thumbnail ? (
                        <img src={resolveImageUrl(item.thumbnail)} alt={item.title || ""} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: "#e5e7eb" }} />
                      )}
                    </Thumb>
                    <div style={{ flex: 1 }}>
                      <ItemTitle>{getLocalizedCartLineTitle(item, locale)}</ItemTitle>
                      <ItemMeta>× {item.quantity}</ItemMeta>
                    </div>
                    <ItemTotal>
                      {formatPriceCents((item.unit_price_cents || 0) * (item.quantity || 1))} €
                    </ItemTotal>
                  </ItemRow>
                ))}
                <TotalRow>
                  <span>{t("total")}</span>
                  <span>{formatPriceCents(order.total_cents || 0)} €</span>
                </TotalRow>
              </Card>
            )}

            <ContinueBtn href="/">{t("continueShopping")}</ContinueBtn>
          </>
        )}
      </Main>
      <Footer />
    </PageWrap>
  );
}
