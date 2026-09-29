"use client";

/**
 * Product page blocks of the "Warmer Marktplatz" design, shared by the desktop and mobile templates:
 *  - PdpInfoCard: stock / bonus points / seller (mobile, under the variants)
 *  - PdpReviewSummary: big average, "von 5 · N Bewertungen", 5→1 star distribution bars
 *  - PdpShippingReturns: Lieferung / Rückgabe / Käuferschutz
 */

import React from "react";
import styled from "styled-components";
import { useTranslations } from "next-intl";

/** Bonus points: 1 point per started euro paid (see /bonus). */
export function bonusPointsForCents(cents) {
  const n = Number(cents);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n / 100) : 0;
}

const Card = styled.div`
  background: #faf6ef;
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  line-height: 1.45;
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  svg {
    flex-shrink: 0;
  }
`;

export function PdpInfoCard({ inStock, stockNote = "", points = 0, sellerName = "" }) {
  const t = useTranslations("product");
  return (
    <Card>
      <div className="row">
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, marginLeft: 4, marginRight: 4, background: inStock ? "#1E7A46" : "#B42318" }} />
        <span>
          <b style={{ color: inStock ? "#1E6B3C" : "#B42318" }}>{inStock ? t("inStockShort") : t("outOfStock")}</b>
          {stockNote ? <> — {stockNote}</> : null}
        </span>
      </div>
      {points > 0 ? (
        <div className="row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A65300" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
          </svg>
          <span>{t("bonusPoints", { points })}</span>
        </div>
      ) : null}
      {sellerName ? (
        <div className="row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5E574E" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6" />
          </svg>
          <span>
            {t("soldBy")} <b>{sellerName}</b>
          </span>
        </div>
      ) : null}
    </Card>
  );
}

const Summary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  .avg {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .avg b {
    font-family: var(--h2-ff, inherit);
    font-size: 44px;
    font-weight: 800;
    line-height: 1;
  }
  .avg span {
    color: #5e574e;
    font-size: 14px;
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 13px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .bar > span:first-child {
    width: 34px;
    white-space: nowrap;
  }
  .track {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: #efe8dd;
    overflow: hidden;
    display: flex;
  }
  .fill {
    background: var(--shop-primary, #ee8a12);
    border-radius: 4px;
  }
  .pct {
    width: 38px;
    text-align: right;
    color: #5e574e;
  }
`;

export function PdpReviewSummary({ average = 0, count = 0, reviews = [] }) {
  const t = useTranslations("product");
  const ratings = (Array.isArray(reviews) ? reviews : []).map((r) => Math.round(Number(r?.rating) || 0)).filter((n) => n >= 1 && n <= 5);
  const total = ratings.length;
  const avg = Number(average) || 0;
  return (
    <Summary>
      <div className="avg">
        <b>{avg > 0 ? avg.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "–"}</b>
        <span>{t("outOfFive", { count: Number(count) || 0 })}</span>
      </div>
      {total > 0 ? (
        <div className="bars">
          {[5, 4, 3, 2, 1].map((star) => {
            const pct = Math.round((ratings.filter((r) => r === star).length / total) * 100);
            return (
              <div className="bar" key={star}>
                <span>{star} ★</span>
                <span className="track" aria-hidden="true">
                  <span className="fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="pct">{pct} %</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </Summary>
  );
}

const Shipping = styled.section`
  background: #fff;
  border-radius: 24px;
  padding: 32px 40px;
  margin-bottom: 20px;
  display: flex;
  gap: 48px;
  align-items: flex-start;
  box-shadow: 0 0 0 1px rgba(29, 27, 24, 0.06);
  h2 {
    margin: 0;
    width: 280px;
    flex-shrink: 0;
    font-family: var(--h2-ff, inherit);
    font-size: clamp(1.25rem, 2vw, 1.625rem);
    font-weight: 800;
  }
  .cols {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    font-size: 14px;
    line-height: 1.55;
  }
  .cols div span {
    display: block;
    color: #5e574e;
  }
  @media (max-width: 767px) {
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    border-radius: 16px;
    h2 {
      width: auto;
      font-size: 20px;
    }
    .cols {
      grid-template-columns: 1fr;
      gap: 8px;
      font-size: 13px;
    }
  }
`;

export function PdpShippingReturns({ shipping = "", returnDays = 14, returnCost = "", sellerName = "" }) {
  const t = useTranslations("product");
  return (
    <Shipping aria-labelledby="pdp-shipping-returns">
      <h2 id="pdp-shipping-returns">{t("shippingReturnsTitle")}</h2>
      <div className="cols">
        <div>
          <b>{t("delivery")}</b>
          <span>{sellerName ? t("deliveryBy", { seller: sellerName, shipping }) : shipping}</span>
        </div>
        <div>
          <b>{t("returns")}</b>
          <span>
            {returnDays} {t("days")}, {returnCost}
          </span>
        </div>
        <div>
          <b>{t("buyerProtection")}</b>
          <span>{t("buyerProtectionText")}</span>
        </div>
      </div>
    </Shipping>
  );
}
