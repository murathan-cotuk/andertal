"use client";

import React from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import styled from "styled-components";

const Bar = styled.div`
  background-color: #faf7f2;
  border-bottom: 1px solid #e6dfd4;
  padding: 12px 0;
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  gap: 32px;
  align-items: center;
  font-size: 14px;
`;

const LinkItem = styled(Link)`
  color: #5e574e;
  font-weight: 500;
  transition: color 0.2s ease;

  &:hover {
    color: #0ea5e9;
  }
`;

export default function SlimBar() {
  const t = useTranslations("slimbar");
  const tn = useTranslations("nav");
  return (
    <Bar>
      <Container>
        <LinkItem href="/bestsellers">{tn("bestsellers")}</LinkItem>
        <LinkItem href="/sale">{t("sale")}</LinkItem>
        <LinkItem href="/recommended">{t("recommended")}</LinkItem>
      </Container>
    </Bar>
  );
}

