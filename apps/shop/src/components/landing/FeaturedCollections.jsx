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
  grid-template-columns: repeat(2, 1fr);
  gap: ${tokens.spacing.lg};

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const Banner = styled(motion(Link))`
  aspect-ratio: 2.2;
  border-radius: ${tokens.radius.card};
  border: 1px solid ${tokens.border.light};
  background: ${tokens.background.soft};
  display: flex;
  align-items: flex-end;
  padding: ${tokens.spacing.xl};
  text-decoration: none;
  color: ${tokens.dark[800]};
  font-weight: 600;
  font-size: ${tokens.fontSize.h4};
  font-family: ${tokens.fontFamily.sans};
  overflow: hidden;
  transition: box-shadow ${tokens.transition.base};

  &:hover {
    box-shadow: ${tokens.shadow.hover};
  }
`;

export default function FeaturedCollections({
  title = "Ausgewählte Kollektionen",
  collections = [],
}) {
  return (
    <Section>
      <Title>{title}</Title>
      <Grid>
        {(collections || []).slice(0, 4).map((col, i) => (
          <Banner
            key={col.id || i}
            href={col.handle ? `/${col.handle}` : "#"}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
          >
            {col.title || "Collection"}
          </Banner>
        ))}
      </Grid>
    </Section>
  );
}
