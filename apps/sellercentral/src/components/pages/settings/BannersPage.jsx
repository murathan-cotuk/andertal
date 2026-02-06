"use client";

import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
`;

const Header = styled.div`
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
  color: white;
  padding: 32px;
  border-radius: 12px;
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #d1d5db;
  margin: 0;
`;

const Section = styled(Card)`
  padding: 24px;
  margin-bottom: 24px;
`;

export default function AdminBannersPage() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const client = getMedusaAdminClient();
      const data = await client.getBanners();
      setBanners(data.banners || []);
    } catch (error) {
      console.error("Error fetching banners:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Header>
        <Title>Banner Management</Title>
        <Subtitle>Manage platform banners and promotional content</Subtitle>
      </Header>

      <Section>
        <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
          Banner Management
        </h2>
        <p style={{ color: "#6b7280" }}>Banner management coming soon.</p>
      </Section>
    </Container>
  );
}
