"use client";

import React from "react";
import styled from "styled-components";
import { Card } from "@belucha/ui";

const Container = styled.div`
  max-width: 1400px;
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

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

const StatCard = styled(Card)`
  padding: 24px;
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 700;
  color: #0ea5e9;
  margin-bottom: 8px;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 4px;
`;

const StatChange = styled.div`
  font-size: 12px;
  color: ${({ $positive }) => ($positive ? "#10b981" : "#ef4444")};
  margin-top: 8px;
`;

const ChartPlaceholder = styled.div`
  width: 100%;
  height: 300px;
  background-color: #f3f4f6;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 18px;
`;

export default function AnalyticsPage() {
  return (
    <Container>
      <Title>Analytics</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Overview
        </h2>
        <StatsGrid>
          <StatCard>
            <StatValue>€0.00</StatValue>
            <StatLabel>Total Revenue</StatLabel>
            <StatChange $positive={false}>0% from last month</StatChange>
          </StatCard>
          <StatCard>
            <StatValue>0</StatValue>
            <StatLabel>Total Orders</StatLabel>
            <StatChange $positive={false}>0% from last month</StatChange>
          </StatCard>
          <StatCard>
            <StatValue>0</StatValue>
            <StatLabel>Total Products</StatLabel>
            <StatChange $positive={true}>0% from last month</StatChange>
          </StatCard>
          <StatCard>
            <StatValue>0%</StatValue>
            <StatLabel>Conversion Rate</StatLabel>
            <StatChange $positive={false}>0% from last month</StatChange>
          </StatCard>
        </StatsGrid>
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Sales Trend
        </h2>
        <ChartPlaceholder>
          <i className="fas fa-chart-line" style={{ fontSize: "48px", marginRight: "12px" }} />
          Sales chart will be displayed here
        </ChartPlaceholder>
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Top Products
        </h2>
        <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
          <i className="fas fa-chart-bar" style={{ fontSize: "48px", marginBottom: "16px", color: "#d1d5db" }} />
          <p>Product performance data will be displayed here</p>
        </div>
      </Section>
    </Container>
  );
}
