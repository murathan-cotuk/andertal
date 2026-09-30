"use client";

/**
 * "Mein Konto" overview header of the "Warmer Marktplatz" design:
 * greeting + tiles (bonus points, latest order, messages, wishlist).
 * Read-only: uses data the account page already loads plus the unread-messages endpoint.
 */

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const Wrap = styled.div`
  margin-bottom: 20px;
  h1 {
    margin: 0 0 14px;
    font-family: var(--h1-ff, inherit);
    font-size: clamp(1.5rem, 3vw, 2.1rem);
    font-weight: 800;
    letter-spacing: -0.015em;
    color: var(--body-color, #1d1b18);
    line-height: 1.15;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  @media (max-width: 1023px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
`;

const Tile = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border-radius: 18px;
  background: ${(p) => (p.$accent ? "#fff3e2" : "#fff")};
  box-shadow: 0 0 0 1px rgba(29, 27, 24, 0.06);
  color: var(--body-color, #1d1b18);
  text-decoration: none;
  min-width: 0;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
  &:hover {
    box-shadow: 0 0 0 1px rgba(29, 27, 24, 0.12), 0 6px 18px rgba(29, 27, 24, 0.06);
    transform: translateY(-1px);
  }
  .k {
    font-size: 12px;
    font-weight: 600;
    color: #5e574e;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .v {
    font-family: var(--h2-ff, inherit);
    font-size: 22px;
    font-weight: 800;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .s {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-top: 2px;
  }
`;

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  background: ${(p) => p.$bg || "#f3f4f6"};
  color: ${(p) => p.$color || "#5e574e"};
  &::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: ${(p) => p.$dot || "#9ca3af"};
    flex-shrink: 0;
  }
`;

const OrderDate = styled.span`
  font-size: 12px;
  color: #948c7f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

/** Mirrors orders/page.jsx STATUS dot/bg/color per key (kept small & local — only pill colours needed here). */
const STATUS_PILL = {
  offen: { dot: "#f59e0b", bg: "#fffbeb", color: "#92400e" },
  pending: { dot: "#f59e0b", bg: "#fffbeb", color: "#92400e" },
  bezahlt: { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  in_bearbeitung: { dot: "#3b82f6", bg: "#eff6ff", color: "#1e40af" },
  processing: { dot: "#3b82f6", bg: "#eff6ff", color: "#1e40af" },
  versendet: { dot: "#8b5cf6", bg: "#f5f3ff", color: "#5b21b6" },
  shipped: { dot: "#8b5cf6", bg: "#f5f3ff", color: "#5b21b6" },
  zugestellt: { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  delivered: { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  abgeschlossen: { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  completed: { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  storniert: { dot: "#ef4444", bg: "#fef2f2", color: "#991b1b" },
  cancelled: { dot: "#ef4444", bg: "#fef2f2", color: "#991b1b" },
};

export default function AccountOverviewTiles({ customer, email, latestOrder, latestOrderStatus, latestOrderStatusKey, latestOrderDate }) {
  const tPanel = useTranslations("accountPanel");
  const [unread, setUnread] = useState(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
    fetch(`${backendUrl}/store/messages/unread-count?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setUnread(Number(d?.count) || 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [email]);

  const name = String(customer?.first_name || "").trim();
  const points = Number(customer?.bonus_points) || 0;

  return (
    <Wrap>
      <h1>{name ? tPanel("hello", { name }) : tPanel("helloNoName")}</h1>
      <Grid>
        <Tile href="/bonus" $accent>
          <span className="k">{tPanel("navBonus")}</span>
          <span className="v">{points.toLocaleString("de-DE")}</span>
        </Tile>
        <Tile href="/orders">
          <span className="k">{tPanel("navOrders")}</span>
          <span className="v">{latestOrder ? `#${latestOrder.order_number || String(latestOrder.id || "").slice(0, 6)}` : "–"}</span>
          {latestOrder ? (
            <span className="s">
              {latestOrderStatus ? (() => {
                const sp = STATUS_PILL[latestOrderStatusKey] || {};
                return (
                  <StatusPill $dot={sp.dot} $bg={sp.bg} $color={sp.color}>
                    {latestOrderStatus}
                  </StatusPill>
                );
              })() : null}
              {latestOrderDate ? <OrderDate>{latestOrderDate}</OrderDate> : null}
            </span>
          ) : null}
        </Tile>
        <Tile href="/nachrichten">
          <span className="k">{tPanel("navMessages")}</span>
          <span className="v">{unread == null ? "–" : unread}</span>
        </Tile>
        <Tile href="/merkzettel">
          <span className="k">{tPanel("navWishlist")}</span>
          <span className="v" aria-hidden="true">♡</span>
        </Tile>
      </Grid>
    </Wrap>
  );
}
