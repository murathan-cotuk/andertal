"use client";

import React from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { motion } from "framer-motion";
import { tokens } from "@/design-system/tokens";

const Section = styled.section`
  padding: ${tokens.sectionGap} ${tokens.containerPadding};
  max-width: 1280px;
  margin: 0 auto;
`;

const Title = styled.h2`
  font-family: ${tokens.fontFamily.sans};
  font-size: ${tokens.fontSize.h2};
  font-weight: 600;
  color: ${tokens.dark[900]};
  margin-bottom: ${tokens.spacing.xl};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${tokens.spacing.lg};
`;

const Card = styled(motion(Link))`
  padding: ${tokens.spacing.lg};
  border-radius: ${tokens.radius.card};
  border: 1px solid ${tokens.border.light};
  background: ${tokens.background.card};
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: box-shadow ${tokens.transition.base};

  &:hover {
    box-shadow: ${tokens.shadow.hover};
  }
`;

const Logo = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${tokens.background.soft};
  margin-bottom: ${tokens.spacing.sm};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${tokens.fontSize.h4};
  color: ${tokens.dark[500]};
`;

const Name = styled.span`
  font-weight: 600;
  font-size: ${tokens.fontSize.body};
  color: ${tokens.dark[800]};
  margin-bottom: ${tokens.spacing.xs};
`;

const Rating = styled.span`
  font-size: ${tokens.fontSize.small};
  color: ${tokens.dark[500]};
  margin-bottom: ${tokens.spacing.sm};
`;

const ZumShop = styled.span`
  font-size: ${tokens.fontSize.small};
  font-weight: 600;
  color: ${tokens.primary.DEFAULT};
`;

export default function SellerHighlight({
  title = "Unsere Verkäufer",
  sellers = [],
}) {
  return (
    <Section>
      <Title>{title}</Title>
      <Grid>
        {(sellers || []).slice(0, 6).map((seller, i) => (
          <Card
            key={seller.id || i}
            href={seller.shopUrl || "#"}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
          >
            <Logo>{seller.logoUrl ? "🖼" : (seller.name || "V")[0]}</Logo>
            <Name>{seller.name || "Verkäufer"}</Name>
            {seller.rating != null && <Rating>★ {seller.rating}</Rating>}
            <ZumShop>Zum Shop</ZumShop>
          </Card>
        ))}
      </Grid>
    </Section>
  );
}
