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

export default function OrdersReturnsPage() {
  return (
    <Container>
      <Title>Returns & Refunds</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Return Requests
        </h2>
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
          <i className="fas fa-undo" style={{ fontSize: "48px", marginBottom: "16px", color: "#d1d5db" }} />
          <p>No return requests at this time</p>
        </div>
      </Section>
    </Container>
  );
}

