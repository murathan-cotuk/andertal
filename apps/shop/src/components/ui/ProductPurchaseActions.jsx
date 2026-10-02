"use client";

import React, { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import styled from "styled-components";

const PurchaseRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: 10px;
  margin-bottom: 10px;
`;

const QtySelect = styled.select`
  height: 52px;
  padding: 0 12px 0 16px;
  font-size: 15px;
  font-weight: 600;
  border: 1px solid #cfc6b8;
  border-radius: 26px;
  background: #fff;
  color: #1d1b18;
  cursor: pointer;
  flex-shrink: 0;
  min-width: 76px;
  appearance: auto;
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const AddBtn = styled.button`
  flex: 1;
  min-width: 0;
  height: 52px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: 26px;
  background: var(--btn-atc-bg, var(--shop-primary, #ee8a12));
  color: var(--btn-atc-text, #1d1b18);
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity 0.15s;
  svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  &:hover:not(:disabled) {
    background: var(--btn-atc-hover-bg, var(--shop-primary, #ee8a12));
    opacity: 0.92;
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    background: #a39a8d;
  }
`;

const BuyNowBtn = styled.button`
  width: 100%;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--body-color, #1d1b18);
  border-radius: 26px;
  background: #fff;
  color: var(--body-color, #1d1b18);
  font-family: inherit;
  font-size: 16px;
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

const NotifyBox = styled.form`
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
`;

const NotifyInput = styled.input`
  flex: 1;
  height: 40px;
  padding: 0 12px;
  font-size: 0.875rem;
  border: 1.5px solid #e6dfd4;
  border-radius: 10px;
  color: #1d1b18;
  min-width: 0;
  &:disabled {
    opacity: 0.6;
  }
`;

const NotifyBtn = styled.button`
  height: 40px;
  padding: 0 16px;
  border: 1.5px solid #1d1b18;
  border-radius: 10px;
  background: #1d1b18;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  &:hover:not(:disabled) {
    opacity: 0.88;
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const NotifyNote = styled.p`
  font-size: 0.8rem;
  margin: 0 0 8px;
  color: ${(p) => (p.$error ? "#b91c1c" : "#059669")};
  font-weight: 600;
`;

/** Shown in place of the buybox for a genuinely sold-out product (not "coming soon" / shipping-
 * unavailable — those are different states with their own messaging). Guest-friendly: no login
 * required, mirrors the newsletter signup pattern (POST straight to the backend). */
function BackInStockForm({ productId, variantId }) {
  const tp = useTranslations("product");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | loading | success | error

  if (!productId) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setState("loading");
    try {
      const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
      const r = await fetch(`${backendUrl}/store/back-in-stock-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), product_id: productId, variant_id: variantId || "", locale }),
      });
      if (!r.ok) throw new Error("error");
      setEmail("");
      setState("success");
    } catch {
      setState("error");
    }
  };

  if (state === "success") {
    return <NotifyNote>{tp("backInStockSuccess")}</NotifyNote>;
  }

  return (
    <>
      <NotifyBox onSubmit={handleSubmit}>
        <NotifyInput
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={tp("backInStockEmailPlaceholder")}
          disabled={state === "loading"}
          autoComplete="email"
        />
        <NotifyBtn type="submit" disabled={state === "loading"}>
          {state === "loading" ? "…" : tp("backInStockCta")}
        </NotifyBtn>
      </NotifyBox>
      {state === "error" && <NotifyNote $error>{tp("backInStockError")}</NotifyNote>}
    </>
  );
}

export default function ProductPurchaseActions({
  quantity,
  onQuantityChange,
  minQty = 1,
  maxQty = 99,
  purchaseDisabled = false,
  onAddToCart,
  onBuyNow,
  cartNotice = { text: "", visible: false },
  shippingUnavailable = false,
  isComingSoon = false,
  inStock = true,
  hideQuantity = false,
  productId = null,
  variantId = null,
}) {
  const tp = useTranslations("product");

  // Genuinely sold out (not "coming soon" / not a shipping-country restriction — those already
  // have their own messaging and don't need a restock alert).
  const showBackInStockForm = !inStock && !isComingSoon && !shippingUnavailable;

  const buttonLabel = shippingUnavailable
    ? tp("notAvailable")
    : isComingSoon
      ? tp("comingSoon")
      : !inStock
        ? tp("outOfStock")
        : tp("addToCart");

  const floor = Math.max(1, Number(minQty) || 1);
  const cap = Math.min(maxQty > 0 ? maxQty : 99, 99);
  const qtyCount = Math.max(0, cap - floor + 1);
  useEffect(() => {
    if (Number(quantity) < floor) onQuantityChange(floor);
  }, [quantity, floor, onQuantityChange]);

  return (
    <>
      {cartNotice.text ? (
        <CartNotice $visible={!!cartNotice.visible}>{cartNotice.text}</CartNotice>
      ) : null}
      <PurchaseRow>
        {!hideQuantity && (
          <QtySelect
            value={quantity}
            disabled={purchaseDisabled}
            onChange={(e) => onQuantityChange(Number(e.target.value))}
            aria-label={tp("qty")}
          >
            {Array.from({ length: qtyCount }, (_, i) => i + floor).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </QtySelect>
        )}
        <AddBtn onClick={onAddToCart} disabled={purchaseDisabled}>
          <CartIcon />
          <span>{buttonLabel}</span>
        </AddBtn>
      </PurchaseRow>
      {floor > 1 && inStock && !isComingSoon && !shippingUnavailable ? (
        <NotifyNote>{tp("minOrderQty", { n: floor })}</NotifyNote>
      ) : null}
      {showBackInStockForm && <BackInStockForm productId={productId} variantId={variantId} />}
      {onBuyNow && (
        <BuyNowBtn onClick={onBuyNow} disabled={purchaseDisabled}>
          {tp("buyNow")}
        </BuyNowBtn>
      )}
    </>
  );
}
