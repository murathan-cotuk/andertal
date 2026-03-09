"use client";

import React, { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { motion } from "framer-motion";
import { tokens } from "@/design-system/tokens";
import { ProductCard } from "@/components/ProductCard";

const Section = styled.section`
  padding: ${tokens.sectionGap} ${tokens.containerPadding};
  max-width: 1280px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.lg};
  margin-bottom: ${tokens.spacing.xl};
  flex-wrap: wrap;
`;

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

const Scroll = styled(motion.div)`
  display: flex;
  gap: ${tokens.spacing.lg};
  overflow-x: auto;
  padding-bottom: ${tokens.spacing.md};
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;

  & > * {
    flex-shrink: 0;
    scroll-snap-align: start;
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

  return (
    <Section>
      <Header>
        <Badge>{badgeText}</Badge>
        <Title>{title}</Title>
        {timeLeft && <Timer>{timeLeft}</Timer>}
        <Cta href={ctaHref}>{ctaText}</Cta>
      </Header>
      <Scroll>
        {(products || []).slice(0, 10).map((product, i) => (
          <motion.div
            key={product.id || i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            style={{ width: 280 }}
          >
            <ProductCard product={product} compact />
          </motion.div>
        ))}
      </Scroll>
    </Section>
  );
}
