"use client";

import React from "react";
import { useTranslations } from "next-intl";
import styled from "styled-components";

const PurchaseRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 8px;
`;

const QtySelect = styled.select`
  height: 40px;
  padding: 0 6px 0 10px;
  font-size: 0.9rem;
  font-weight: 600;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  color: #111827;
  cursor: pointer;
  flex-shrink: 0;
  min-width: 66px;
  appearance: auto;
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const AddBtn = styled.button`
  flex: 1;
  height: 40px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: none;
  border-radius: 10px;
  background: var(--shop-primary, #ff971c);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  &:hover:not(:disabled) {
    opacity: 0.88;
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    background: #9ca3af;
  }
`;

const BuyNowBtn = styled.button`
  width: 100%;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--shop-primary, #ff971c);
  border-radius: 10px;
  background: transparent;
  color: var(--shop-primary, #ff971c);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
  margin-bottom: 8px;
  &:hover:not(:disabled) {
    opacity: 0.75;
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const CartNotice = styled.div`
  font-size: 0.82rem;
  font-weight: 600;
  color: #065f46;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 8px;
  padding: 7px 10px;
  text-align: center;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transform: translateY(${(p) => (p.$visible ? "0px" : "5px")});
  transition: opacity 450ms ease, transform 450ms ease;
  margin-bottom: 4px;
`;

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.2 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.76L21 7H6.2" />
    </svg>
  );
}

export default function ProductPurchaseActions({
  quantity,
  onQuantityChange,
  maxQty = 99,
  purchaseDisabled = false,
  onAddToCart,
  onBuyNow,
  cartNotice = { text: "", visible: false },
  shippingUnavailable = false,
  isComingSoon = false,
  inStock = true,
}) {
  const tp = useTranslations("product");

  const buttonLabel = shippingUnavailable
    ? tp("notAvailable")
    : isComingSoon
      ? tp("comingSoon")
      : !inStock
        ? tp("outOfStock")
        : tp("addToCart");

  const qtyCount = Math.min(maxQty > 0 ? maxQty : 99, 99);

  return (
    <>
      {cartNotice.text ? (
        <CartNotice $visible={!!cartNotice.visible}>{cartNotice.text}</CartNotice>
      ) : null}
      <PurchaseRow>
        <QtySelect
          value={quantity}
          disabled={purchaseDisabled}
          onChange={(e) => onQuantityChange(Number(e.target.value))}
          aria-label={tp("qty")}
        >
          {Array.from({ length: qtyCount }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </QtySelect>
        <AddBtn onClick={onAddToCart} disabled={purchaseDisabled}>
          <CartIcon />
          <span>{buttonLabel}</span>
        </AddBtn>
      </PurchaseRow>
      {onBuyNow && (
        <BuyNowBtn onClick={onBuyNow} disabled={purchaseDisabled}>
          {tp("buyNow")}
        </BuyNowBtn>
      )}
    </>
  );
}
