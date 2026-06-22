"use client";

import React, { useState } from "react";
import styled from "styled-components";
import { Card, Button } from "@andertal/ui";
import { useLocale } from "next-intl";
import { getNotificationSettingsCopy } from "@/lib/settings-pages-i18n";

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

const NotificationItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #e5e7eb;

  &:last-child {
    border-bottom: none;
  }
`;

const NotificationInfo = styled.div`
  flex: 1;
`;

const NotificationTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
`;

const NotificationDescription = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin: 0;
`;

const Toggle = styled.label`
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: 0.4s;
    border-radius: 24px;

    &:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.4s;
      border-radius: 50%;
    }
  }

  input:checked + span {
    background-color: #0ea5e9;
  }

  input:checked + span:before {
    transform: translateX(24px);
  }
`;

export default function NotificationSettingsPage() {
  const locale = useLocale();
  const copy = getNotificationSettingsCopy(locale);
  const [notifications, setNotifications] = useState({
    orderUpdates: true,
    paymentNotifications: true,
    productAlerts: true,
    marketingEmails: false,
    weeklyReports: true,
    securityAlerts: true,
  });

  const handleToggle = (key) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Container>
      <Title>{copy.pageTitle}</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          {copy.emailTitle}
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "24px" }}>
          {copy.emailSubtitle}
        </p>

        {copy.items.map((item) => (
          <NotificationItem key={item.key}>
            <NotificationInfo>
              <NotificationTitle>{item.title}</NotificationTitle>
              <NotificationDescription>{item.description}</NotificationDescription>
            </NotificationInfo>
            <Toggle>
              <input
                type="checkbox"
                checked={notifications[item.key]}
                onChange={() => handleToggle(item.key)}
              />
              <span />
            </Toggle>
          </NotificationItem>
        ))}

        <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
          <Button>
            {copy.savePreferences}
          </Button>
        </div>
      </Section>
    </Container>
  );
}

