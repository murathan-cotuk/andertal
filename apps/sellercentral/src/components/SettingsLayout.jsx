"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

const SETTINGS_ITEMS = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/plan", label: "Plan" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/users-permissions", label: "Users and Permissions" },
  { href: "/settings/payments", label: "Payments" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/checkout", label: "Checkout" },
  { href: "/settings/shipping", label: "Shipping and delivery" },
  { href: "/settings/integrations", label: "Apps & Integrations" },
  { href: "/settings/taxes", label: "Taxes and duties" },
  { href: "/settings/locations", label: "Locations" },
  { href: "/settings/notifications", label: "Notifications" },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();

  return (
    <Page
      title="Settings"
      backAction={{ content: "Back", url: "/" }}
      divider
    >
      <Layout>
        <Layout.Section variant="oneThird">
          <Card padding="0">
            <BlockStack gap="0">
              {SETTINGS_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--p-color-border-subdued)",
                      backgroundColor: pathname === item.href ? "var(--p-color-bg-surface-selected)" : undefined,
                    }}
                  >
                    <Text as="span" variant="bodyMd" fontWeight={pathname === item.href ? "semibold" : "regular"}>
                      {item.label}
                    </Text>
                  </div>
                </Link>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>{children}</Layout.Section>
      </Layout>
    </Page>
  );
}
