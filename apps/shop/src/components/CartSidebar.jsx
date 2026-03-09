"use client";

import React from "react";
import styled from "styled-components";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/context/CartContext";
import { formatPriceCents } from "@/lib/format";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 9998;
  opacity: ${(p) => (p.$open ? 1 : 0)};
  pointer-events: ${(p) => (p.$open ? "auto" : "none")};
  transition: opacity 0.2s ease;
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
  z-index: 9999;
  display: flex;
  flex-direction: column;
  transform: translateX(${(p) => (p.$open ? 0 : "100%")});
  transition: transform 0.25s ease;
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
    object-fit: cover;
  }
`;

const ItemBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 4px;
  line-height: 1.3;
`;

const ItemPrice = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 8px;
`;

const QtyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const QtyBtn = styled.button`
  width: 28px;
  height: 28px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: #374151;
  &:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const QtyVal = styled.span`
  font-size: 0.875rem;
  min-width: 24px;
  text-align: center;
`;

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
  background: #0ea5e9;
  color: #fff;
  font-weight: 600;
  font-size: 0.9375rem;
  border-radius: 8px;
  text-decoration: none;
  margin-bottom: 12px;
  &:hover {
    background: #0284c7;
    color: #fff;
  }
`;

const TextLink = styled(Link)`
  display: block;
  text-align: center;
  font-size: 0.875rem;
  color: #0ea5e9;
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

export default function CartSidebar() {
  const { cart, sidebarOpen, closeCartSidebar, updateLineItem, removeLineItem, loading, subtotalCents } = useCart();
  const items = cart?.items || [];

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
                  <img src={item.thumbnail} alt="" />
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
                    {item.title || "Artikel"}
                  </Link>
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
                  <QtyVal>{item.quantity || 0}</QtyVal>
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
            </Item>
          ))}
        </Scroll>
        {items.length > 0 && (
          <Footer>
            <Row>
              <span>Zwischensumme</span>
              <span>{formatPriceCents(subtotalCents)}</span>
            </Row>
            <Row>
              <span>Versand</span>
              <span>Wird an der Kasse berechnet</span>
            </Row>
            <RowTotal>
              <span>Gesamt</span>
              <span>{formatPriceCents(subtotalCents)}</span>
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
