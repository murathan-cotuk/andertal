"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

const SETTINGS_ITEMS_ALL = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/verification", label: "Verification", sellerOnly: true },
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

  const settingsItems = SETTINGS_ITEMS_ALL.filter((item) => {
    if (item.superuserOnly && !isSuperuser) return false;
    if (item.sellerOnly && isSuperuser) return false;
    return true;
  });

  const currentPath = String(pathname || "");
  const isItemActive = (href) => {
    if (!href) return false;
    // Works for locale-prefixed routes: /de/settings/general
    return currentPath === href || currentPath.endsWith(href);
  };

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
                  {(() => {
                    const active = isItemActive(item.href);
                    return (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--p-color-border-subdued)",
                      backgroundColor: active ? "var(--p-color-bg-surface-selected)" : "var(--p-color-bg-surface)",
                      borderLeft: active ? "3px solid #008060" : "3px solid transparent",
                      boxShadow: active ? "inset 0 0 0 1px rgba(0,128,96,0.08)" : "none",
                      transition: "background-color .15s ease, border-left-color .15s ease",
                    }}
                  >
                    <Text as="span" variant="bodyMd" fontWeight={active ? "semibold" : "regular"} tone={active ? "base" : "subdued"}>
                      {item.label}
                    </Text>
                  </div>
                    );
                  })()}
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
