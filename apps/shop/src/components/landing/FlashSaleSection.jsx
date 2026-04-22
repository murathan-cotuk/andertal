"use client";

import React, { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { tokens } from "@/design-system/tokens";
import Carousel from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";

const Badge = styled.span`
  display: inline-block;
  padding: ${tokens.spacing.xs} ${tokens.spacing.md};
  background: ${tokens.primary.light};
  color: ${tokens.primary.DEFAULT};
  font-weight: 600;
  font-size: ${tokens.fontSize.small};
  border-radius: ${tokens.radius.button};
`;

const Title = styled.h2`
  font-family: ${tokens.fontFamily.sans};
  font-size: ${tokens.fontSize.h2};
  font-weight: 600;
  color: ${tokens.dark[900]};
  margin: 0;
`;

const Timer = styled.div`
  font-size: ${tokens.fontSize.small};
  color: ${tokens.dark[600]};
  font-family: monospace;
`;

const Cta = styled(Link)`
  margin-left: auto;
  font-weight: 600;
  color: ${tokens.primary.DEFAULT};
  text-decoration: none;
  font-size: ${tokens.fontSize.small};

  &:hover {
    text-decoration: underline;
  }
`;

export default function FlashSaleSection({
  title = "Angebote",
  badgeText = "Angebot",
  ctaText = "Jetzt entdecken",
  ctaHref = "/sale",
  products = [],
  endDate,
}) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!endDate) {
      setTimeLeft("00:00:00");
      return;
    }
    const update = () => {
      const end = new Date(endDate).getTime();
      const now = Date.now();
      if (now >= end) {
        setTimeLeft("00:00:00");
        return;
      }
      const d = Math.floor((end - now) / 1000);
      const h = Math.floor(d / 3600);
      const m = Math.floor((d % 3600) / 60);
      const s = d % 60;
      setTimeLeft(
        [h, m, s].map((x) => String(x).padStart(2, "0")).join(":")
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endDate]);

  const list = (products || []).slice(0, 10);

  const header = (
    <>
      <Badge>{badgeText}</Badge>
      <Title>{title}</Title>
      {timeLeft ? <Timer>{timeLeft}</Timer> : null}
      <Cta href={ctaHref}>{ctaText}</Cta>
    </>
  );

  return (
    <Carousel
      header={header}
      visibleCount={2}
      navOnSides
      gap={16}
      showFade={false}
      ariaLabel={title}
    >
      {list.map((product, i) => (
        <ProductCard key={product.id || i} product={product} plainImage />
      ))}
    </Carousel>
  );
}
