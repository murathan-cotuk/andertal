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
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: ${tokens.spacing.lg};
`;

const Card = styled(motion(Link))`
  aspect-ratio: 1;
  border-radius: ${tokens.radius.card};
  border: 1px solid ${tokens.border.light};
  overflow: hidden;
  position: relative;
  background: ${tokens.background.soft};
  display: flex;
  align-items: flex-end;
  text-decoration: none;
  color: white;

  &:hover .overlay {
    opacity: 0.85;
  }
`;

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.7), transparent 50%);
  opacity: 0.6;
  transition: opacity ${tokens.transition.base};
`;

const Label = styled.span`
  position: relative;
  z-index: 1;
  padding: ${tokens.spacing.md};
  font-weight: 600;
  font-size: ${tokens.fontSize.small};
  font-family: ${tokens.fontFamily.sans};
`;

const PlaceholderBg = styled.div`
  position: absolute;
  inset: 0;
  background: ${tokens.dark[600]};
`;

export default function CategoryShowcase({
  title = "Kategorien",
  categories = [],
}) {
  return (
    <Section>
      <Title>{title}</Title>
      <Grid>
        {categories.slice(0, 6).map((cat, i) => (
          <Card
            key={cat.id || cat.slug || i}
            href={cat.slug ? `/kollektion/${cat.slug}` : cat.handle ? `/kollektion/${cat.handle}` : "#"}
            whileHover={{ scale: 1.03 }}
            transition={{ duration: 0.2 }}
          >
            <PlaceholderBg />
            <Overlay className="overlay" />
            <Label>{cat.title || cat.name || "Kategorie"}</Label>
          </Card>
        ))}
      </Grid>
    </Section>
  );
}
