"use client";

import React from "react";
import styled from "styled-components";
import { Card } from "@belucha/ui";

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 32px;
  color: #1f2937;
`;

const Section = styled(Card)`
  padding: 24px;
  margin-bottom: 24px;
`;

export default function AnalyticsPage() {
  return (
    <Container>
      <Title>Analytics</Title>
      <Section>
        <h2>View your store performance</h2>
        <p>Track sales, views, and customer behavior.</p>
      </Section>
    </Container>
  );
}

