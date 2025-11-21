"use client";

import React from "react";
import Link from "next/link";
import styled from "styled-components";

const Bar = styled.div`
  background-color: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
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
  color: #6b7280;
  font-weight: 500;
  transition: color 0.2s ease;

  &:hover {
    color: #0ea5e9;
  }
`;

export default function SlimBar() {
  return (
    <Bar>
      <Container>
        <LinkItem href="/?filter=bestsellers">Bestsellers</LinkItem>
        <LinkItem href="/?filter=sale">On Sale</LinkItem>
        <LinkItem href="/?filter=recommended">Products for You</LinkItem>
      </Container>
    </Bar>
  );
}

