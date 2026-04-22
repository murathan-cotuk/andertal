"use client";

import React from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { motion } from "framer-motion";
import { tokens } from "@/design-system/tokens";
import Carousel from "@/components/Carousel";

const Section = styled(motion.section)`
  width: 100%;
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  background: ${tokens.background.main};
  position: relative;
`;

const TopRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${tokens.spacing["3xl"]};
  max-width: 1280px;
  margin: 0 auto;
  padding: ${tokens.sectionGap} ${tokens.containerPadding};
  align-items: center;
  flex: 1;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    padding: ${tokens.spacing["2xl"]} ${tokens.containerPadding};
  }
`;

const TextBlock = styled.div`
  max-width: 520px;
`;

const Headline = styled.h1`
  font-family: var(--h1-ff, ${tokens.fontFamily.sans});
  font-size: var(--h1-fs, ${tokens.fontSize.h1});
  font-weight: var(--h1-fw, 700);
  font-style: var(--h1-style, normal);
  line-height: var(--h1-lh, ${tokens.lineHeight.tight});
  letter-spacing: var(--h1-ls, -0.02em);
  color: var(--h1-color, ${tokens.dark[900]});
  margin-bottom: ${tokens.spacing.lg};
`;

const Subline = styled.p`
  font-size: ${tokens.fontSize.bodyLg};
  line-height: ${tokens.lineHeight.relaxed};
  color: ${tokens.dark[600]};
  margin-bottom: ${tokens.spacing.xl};
`;

const Cta = styled(Link)`
  display: inline-block;
  padding: ${tokens.spacing.md} ${tokens.spacing.xl};
  background: ${tokens.primary.DEFAULT};
  color: white;
  font-weight: 600;
  font-size: ${tokens.fontSize.body};
  border-radius: ${tokens.radius.button};
  text-decoration: none;
  transition: background ${tokens.transition.base};

  &:hover {
    background: ${tokens.primary.hover};
  }
`;

const VisualBlock = styled(motion.div)`
  aspect-ratio: 1;
  max-height: 400px;
  background: ${tokens.background.soft};
  border-radius: ${tokens.radius.card};
  border: 1px solid ${tokens.border.light};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${tokens.dark[500]};
  font-size: ${tokens.fontSize.small};
`;

const CarouselWrap = styled.div`
  padding: ${tokens.spacing.lg} ${tokens.containerPadding};
  max-width: 1280px;
  margin: 0 auto;
`;

const CollectionCard = styled(motion(Link))`
  flex-shrink: 0;
  width: 160px;
  height: 120px;
  border-radius: ${tokens.radius.card};
  border: 1px solid ${tokens.border.light};
  background: ${tokens.background.card};
  box-shadow: ${tokens.shadow.card};
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  text-decoration: none;
  color: ${tokens.dark[800]};
  font-weight: 600;
  font-size: ${tokens.fontSize.small};
  padding: ${tokens.spacing.sm};
  scroll-snap-align: start;
  transition: box-shadow ${tokens.transition.base}, transform ${tokens.transition.base};

  &:hover {
    box-shadow: ${tokens.shadow.hover};
    transform: scale(1.03);
  }
`;

export default function HeroSection({
  headline = "Premium Marktplatz",
  subline = "Entdecken Sie ausgewählte Produkte von vertrauenswürdigen Verkäufern.",
  ctaText = "Jetzt entdecken",
  ctaHref = "/collections",
  collections = [],
}) {
  return (
    <Section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <TopRow>
        <TextBlock>
          <Headline>{headline}</Headline>
          <Subline>{subline}</Subline>
          <Cta href={ctaHref}>{ctaText}</Cta>
        </TextBlock>
        <VisualBlock
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          3D / Parallax Platzhalter
        </VisualBlock>
      </TopRow>
      {collections.length > 0 && (
        <CarouselWrap>
          <Carousel
            contained={false}
            itemWidth={160}
            gap={16}
            showNav={false}
            showFade
            fadeBgColor={tokens.background.main}
          >
          {collections.slice(0, 6).map((col, i) => (
            <CollectionCard
              key={col.id || i}
              href={col.handle ? `/${col.handle}` : "#"}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              whileHover={{ scale: 1.03 }}
            >
              {col.title || "Collection"}
            </CollectionCard>
          ))}
          </Carousel>
        </CarouselWrap>
      )}
    </Section>
  );
}
