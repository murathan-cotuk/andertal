"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

const SETTINGS_ITEMS_ALL = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/plan", label: "Plan" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/users-permissions", label: "Users and Permissions" },
  { href: "/settings/payments", label: "Payments" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/checkout", label: "Checkout", superuserOnly: true },
  { href: "/settings/shipping", label: "Shipping and delivery" },
  { href: "/settings/integrations", label: "Apps & Integrations" },
  { href: "/settings/taxes", label: "Taxes and duties" },
  { href: "/settings/locations", label: "Locations" },
  { href: "/settings/notifications", label: "Notifications" },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  const [isSuperuser, setIsSuperuser] = useState(false);

  useEffect(() => {
    setIsSuperuser(
      typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true",
    );
  }, []);

  const settingsItems = SETTINGS_ITEMS_ALL.filter((item) => !item.superuserOnly || isSuperuser);

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
              {settingsItems.map((item) => (
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
