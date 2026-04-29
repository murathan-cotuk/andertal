"use client";

import React from "react";
import styled from "styled-components";
import { Card } from "@andertal/ui";

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

export default function ReportsPage() {
  return (
    <Container>
      <Title>Reports</Title>
      <Section>
        <h2>Generate and download reports</h2>
        <p>Sales reports, tax reports, and more.</p>
      </Section>
    </Container>
  );
}

