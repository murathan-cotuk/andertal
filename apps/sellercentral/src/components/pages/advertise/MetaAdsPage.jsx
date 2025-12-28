"use client";

import React, { useState } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";

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

export default function MetaAdsPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [apiKey, setApiKey] = useState("");

  return (
    <Container>
      <Title>Meta (Facebook/Instagram) Ads Integration</Title>

      <Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}>
              Meta Ads Account
            </h2>
            <p style={{ color: "#6b7280" }}>
              {isConnected ? "Your Meta Ads account is connected" : "Connect your Meta Ads account to manage campaigns"}
            </p>
          </div>
          <div style={{ fontSize: "48px", color: "#1877F2" }}>
            <i className="fab fa-facebook" />
          </div>
        </div>

        {!isConnected ? (
          <div>
            <div style={{ marginBottom: "16px" }}>
              <Input
                label="Meta Ads API Key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Meta Ads API key"
              />
            </div>
            <Button onClick={() => setIsConnected(true)}>
              <i className="fas fa-link" style={{ marginRight: "8px" }} />
              Connect Account
            </Button>
          </div>
        ) : (
          <div style={{ padding: "16px", backgroundColor: "#d1fae5", borderRadius: "8px", color: "#065f46" }}>
            <i className="fas fa-check-circle" style={{ marginRight: "8px" }} />
            Account connected successfully
            <Button
              variant="outline"
              style={{ marginLeft: "16px" }}
              onClick={() => {
                setIsConnected(false);
                setApiKey("");
              }}
            >
              Disconnect
            </Button>
          </div>
        )}
      </Section>
    </Container>
  );
}

