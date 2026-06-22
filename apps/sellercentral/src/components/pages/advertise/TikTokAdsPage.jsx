"use client";

import React, { useState } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@andertal/ui";
import { useLocale } from "next-intl";
import { getAdsPlatformCopy } from "@/lib/advertise-pages-i18n";

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

export default function TikTokAdsPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const locale = useLocale();
  const copy = getAdsPlatformCopy(locale, "tiktok");

  return (
    <Container>
      <Title>{copy.integration}</Title>

      <Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}>
              {copy.account}
            </h2>
            <p style={{ color: "#6b7280" }}>
              {isConnected ? copy.connected : copy.connectText}
            </p>
          </div>
          <div style={{ fontSize: "48px", color: "#000000" }}>
            <i className="fab fa-tiktok" />
          </div>
        </div>

        {!isConnected ? (
          <div>
            <div style={{ marginBottom: "16px" }}>
              <Input
                label={copy.keyLabel}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={copy.keyPlaceholder}
              />
            </div>
            <Button onClick={() => setIsConnected(true)}>
              <i className="fas fa-link" style={{ marginRight: "8px" }} />
              {copy.connect}
            </Button>
          </div>
        ) : (
          <div style={{ padding: "16px", backgroundColor: "#d1fae5", borderRadius: "8px", color: "#065f46" }}>
            <i className="fas fa-check-circle" style={{ marginRight: "8px" }} />
            {copy.connectedOk}
            <Button
              variant="outline"
              style={{ marginLeft: "16px" }}
              onClick={() => {
                setIsConnected(false);
                setApiKey("");
              }}
            >
              {copy.disconnect}
            </Button>
          </div>
        )}
      </Section>
    </Container>
  );
}

