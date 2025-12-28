"use client";

import React from "react";
import styled from "styled-components";
import { Card } from "@belucha/ui";
import Link from "next/link";

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

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

const SettingsCard = styled(Link)`
  display: block;
  padding: 24px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;

  &:hover {
    border-color: #0ea5e9;
    transform: translateY(-2px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
`;

const SettingsIcon = styled.div`
  font-size: 32px;
  color: #0ea5e9;
  margin-bottom: 16px;
`;

const SettingsTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
`;

const SettingsDescription = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin: 0;
`;

const settingsItems = [
  {
    href: "/settings/account",
    icon: "fas fa-user-cog",
    title: "Account Settings",
    description: "Manage your account information and preferences",
  },
  {
    href: "/settings/payment",
    icon: "fas fa-credit-card",
    title: "Payment Methods",
    description: "Add and manage your payment methods",
  },
  {
    href: "/settings/notifications",
    icon: "fas fa-bell",
    title: "Notifications",
    description: "Configure your notification preferences",
  },
  {
    href: "/settings/security",
    icon: "fas fa-shield-alt",
    title: "Security",
    description: "Manage password and security settings",
  },
  {
    href: "/settings/billing",
    icon: "fas fa-file-invoice-dollar",
    title: "Billing",
    description: "View invoices and billing history",
  },
];

export default function SettingsPage() {
  return (
    <Container>
      <Title>Settings</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          General Settings
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "24px" }}>
          Manage your account settings and preferences
        </p>

        <SettingsGrid>
          {settingsItems.map((item) => (
            <SettingsCard key={item.href} href={item.href}>
              <SettingsIcon>
                <i className={item.icon} />
              </SettingsIcon>
              <SettingsTitle>{item.title}</SettingsTitle>
              <SettingsDescription>{item.description}</SettingsDescription>
            </SettingsCard>
          ))}
        </SettingsGrid>
      </Section>
    </Container>
  );
}

