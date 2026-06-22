"use client";

import React from "react";
import { useTranslations } from "next-intl";
import styled from "styled-components";
import ToCartButton from "@/components/ui/To Cart Button";
import ProductQuantityStepper from "@/components/ui/ProductQuantityStepper";

const PurchaseBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
  width: 100%;
  align-items: stretch;

  @media (min-width: 520px) {
    flex-direction: ${(p) => (p.$stackOnly ? "column" : "row")};
    align-items: ${(p) => (p.$stackOnly ? "stretch" : "flex-end")};
    gap: 12px;
  }
`;

const PurchaseCta = styled.div`
  flex: 1;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const CartNotice = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  color: #065f46;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 10px;
  padding: 8px 10px;
  text-align: center;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transform: translateY(${(p) => (p.$visible ? "0px" : "6px")});
  transition: opacity 450ms ease, transform 450ms ease;
`;

export default function ProductPurchaseActions({
  locale = "de",
  quantity,
  onQuantityChange,
  maxQty = 9999,
  purchaseDisabled = false,
  onAddToCart,
  cartNotice = { text: "", visible: false },
  shippingUnavailable = false,
  isComingSoon = false,
  inStock = true,
  publishDate = null,
  stackOnly = false,
}) {
  const tp = useTranslations("product");

  const buttonLabel = shippingUnavailable
    ? tp("notAvailable")
    : isComingSoon
      ? tp("comingSoon")
      : !inStock
        ? tp("outOfStock")
        : tp("addToCart");

  return (
    <PurchaseBar $stackOnly={stackOnly}>
      <ProductQuantityStepper
        label={tp("qty")}
        value={quantity}
        onChange={onQuantityChange}
        min={1}
        max={maxQty}
        disabled={purchaseDisabled}
      />
      <PurchaseCta>
        {cartNotice.text ? (
          <CartNotice $visible={!!cartNotice.visible}>{cartNotice.text}</CartNotice>
        ) : null}
        <ToCartButton onClick={onAddToCart} disabled={purchaseDisabled}>
          {buttonLabel}
        </ToCartButton>
        {isComingSoon && publishDate && !isNaN(publishDate.getTime()) && (
          <p style={{ fontSize: "0.8125rem", color: "#6b7280", margin: 0, fontWeight: 400 }}>
            {tp("comingSoon")}
            <span style={{ marginLeft: 6 }}>
              ({publishDate.toLocaleDateString(locale === "tr" ? "tr-TR" : locale === "de" ? "de-DE" : locale, { day: "numeric", month: "long", year: "numeric" })})
            </span>
          </p>
        )}
      </PurchaseCta>
    </PurchaseBar>
  );
}
