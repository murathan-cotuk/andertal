"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Layout, Card, Text, BlockStack, Box, InlineStack, Button } from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";

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
  const router = useRouter();
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
    <div className="andertal-settings-shell">
      <Box paddingBlockEnd="200">
        <InlineStack gap="200" blockAlign="center">
          <Button
            variant="plain"
            icon={ArrowLeftIcon}
            onClick={() => router.push("/")}
            accessibilityLabel="Back"
          >
            Back
          </Button>
        </InlineStack>
      </Box>
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
                      borderLeft: active
                        ? `3px solid ${item.superuserOnly ? "#601b1b" : "#008060"}`
                        : item.superuserOnly
                          ? "3px solid rgba(96, 27, 27, 0.35)"
                          : "3px solid transparent",
                      boxShadow: active
                        ? item.superuserOnly
                          ? "inset 0 0 0 1px rgba(96, 27, 27, 0.15)"
                          : "inset 0 0 0 1px rgba(0,128,96,0.08)"
                        : "none",
                      transition: "background-color .15s ease, border-left-color .15s ease",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {item.superuserOnly ? (
                        <span
                          style={{
                            fontSize: "var(--p-font-size-350, 13px)",
                            lineHeight: "var(--p-font-line-height-400, 20px)",
                            fontWeight: active ? 700 : 600,
                            color: "#601b1b",
                          }}
                        >
                          {item.label}
                        </span>
                      ) : (
                        <Text
                          as="span"
                          variant="bodyMd"
                          fontWeight={active ? "semibold" : "regular"}
                          tone={active ? "base" : "subdued"}
                        >
                          {item.label}
                        </Text>
                      )}
                    </span>
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
    </div>
  );
}
