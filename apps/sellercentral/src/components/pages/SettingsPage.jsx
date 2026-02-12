"use client";

import React from "react";
import Link from "next/link";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Icon,
} from "@shopify/polaris";
import { ProfileIcon, CreditCardIcon, NotificationIcon, LockIcon, ReceiptIcon } from "@shopify/polaris-icons";

const settingsItems = [
  { href: "/settings/account", icon: ProfileIcon, title: "Account", description: "Manage your account and preferences" },
  { href: "/settings/payment", icon: CreditCardIcon, title: "Payment methods", description: "Add and manage payment methods" },
  { href: "/settings/notifications", icon: NotificationIcon, title: "Notifications", description: "Configure notification preferences" },
  { href: "/settings/security", icon: LockIcon, title: "Security", description: "Password and security settings" },
  { href: "/settings/billing", icon: ReceiptIcon, title: "Billing", description: "Invoices and billing history" },
];

export default function SettingsPage() {
  return (
    <Page
      title="Settings"
      subtitle="Manage your account settings and preferences"
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                General settings
              </Text>
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                {settingsItems.map((item) => (
                  <Link key={item.href} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
                    <Card padding="400">
                      <BlockStack gap="300">
                        <Icon source={item.icon} tone="base" />
                        <Text as="h3" variant="headingSm">
                          {item.title}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {item.description}
                        </Text>
                      </BlockStack>
                    </Card>
                  </Link>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
