"use client";

import React from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { tokens } from "@/design-system/tokens";

const Bar = styled.div`
  height: ${tokens.topBar.height};
  background: ${tokens.dark[900]};
  color: white;
  font-size: ${tokens.topBar.fontSize};
  font-family: ${tokens.fontFamily.sans};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Container = styled.div`
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 0 ${tokens.containerPadding};
  display: flex;
  justify-content: center;
  align-items: center;
  gap: ${tokens.spacing.xl};
  flex-wrap: wrap;
`;

const Item = styled(Link)`
  color: inherit;
  text-decoration: none;
  transition: opacity ${tokens.transition.base};

  &:hover {
    opacity: 0.9;
  }
`;

const DEFAULT_ITEMS = [
  { text: "Kostenloser Versand ab 50 €", href: "/shipping" },
  { text: "Kontakt", href: "/contact" },
  { text: "Retouren & Umtausch", href: "/returns" },
  { text: "Sicher einkaufen", href: "/secure" },
];

export default function TopBar({ items = DEFAULT_ITEMS }) {
  return (
    <Bar>
      <Container>
        {items.slice(0, 4).map((item, i) => (
          <Item key={i} href={item.href || "#"}>
            {item.text}
          </Item>
        ))}
      </Container>
    </Bar>
  );
}
