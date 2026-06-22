"use client";

import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { tokens } from "@/design-system/tokens";
import { useTranslations } from "next-intl";

const Section = styled.section`
  padding: ${tokens.spacing.xl} ${tokens.containerPadding};
  background: ${tokens.background.soft};
  border-top: 1px solid ${tokens.border.light};
  border-bottom: 1px solid ${tokens.border.light};
`;

const Inner = styled(motion.div)`
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  justify-content: center;
  gap: ${tokens.spacing["2xl"]};
  flex-wrap: wrap;
`;

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  font-size: ${tokens.fontSize.small};
  color: ${tokens.dark[700]};
  font-family: ${tokens.fontFamily.sans};
`;

const Icon = styled.span`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
`;

export default function TrustBar({ items }) {
  const t = useTranslations("trust");
  const localizedItems = items || [
    { icon: "🚚", text: t("fastShipping") },
    { icon: "↩️", text: t("returns30") },
    { icon: "🔒", text: t("securePayment") },
    { icon: "✓", text: t("verifiedSellers") },
  ];
  return (
    <Section>
      <Inner
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        {localizedItems.map((item, i) => (
          <Item key={i}>
            <Icon>{item.icon}</Icon>
            <span>{item.text}</span>
          </Item>
        ))}
      </Inner>
    </Section>
  );
}
