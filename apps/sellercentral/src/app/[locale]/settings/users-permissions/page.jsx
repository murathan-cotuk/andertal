"use client";

import React, { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  Divider,
  Box,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function UsersPermissionsPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (su) fetchUsers();
    else setLoading(false);
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMedusaAdminClient().getSellerUsers();
      setUsers(data?.users || []);
    } catch (err) {
      setError(err?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const toggleSuperuser = async (user) => {
    const newVal = !user.is_superuser;
    const myEmail = typeof window !== "undefined" ? localStorage.getItem("sellerEmail") : "";
    if (user.email === myEmail && !newVal) {
      if (!confirm("Are you sure you want to remove your own superuser status? You will lose admin access.")) return;
    }
    setSaving(user.id);
    try {
      await getMedusaAdminClient().setSellerUserSuperuser(user.id, newVal);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_superuser: newVal } : u));
    } catch (err) {
      alert(err?.message || "Failed to update user");
    } finally {
      setSaving(null);
    }
  };

  if (!isSuperuser) {
    return (
      <Page title="Users & Permissions">
        <Layout>
          <Layout.Section>
            <Card>
              <Banner tone="warning">
                <Text>Only superusers can manage user permissions.</Text>
              </Banner>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Users & Permissions" subtitle="Manage seller accounts and superuser access">
      <Layout>
        <Layout.Section>
          {error && (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              <Text>{error}</Text>
            </Banner>
          )}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Seller Accounts</Text>
                <Button onClick={fetchUsers} loading={loading} size="slim">Refresh</Button>
              </InlineStack>
              <Divider />
              {loading ? (
                <Box padding="400"><Text tone="subdued">Loading users…</Text></Box>
              ) : users.length === 0 ? (
                <Box padding="400"><Text tone="subdued">No users registered yet.</Text></Box>
              ) : (
                <BlockStack gap="0">
                  {users.map((user, i) => (
                    <div
                      key={user.id}
                      style={{
                        padding: "14px 0",
                        borderBottom: i < users.length - 1 ? "1px solid var(--p-color-border-subdued)" : "none",
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        gap: 16,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="bodyMd" fontWeight="semibold">{user.store_name || "—"}</Text>
                          {user.is_superuser && <Badge tone="attention">Superuser</Badge>}
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued">{user.email}</Text>
                        <Text variant="bodySm" tone="subdued">ID: {user.seller_id}</Text>
                      </div>
                      <Text variant="bodySm" tone="subdued">
                        {new Date(user.created_at).toLocaleDateString()}
                      </Text>
                      <Button
                        size="slim"
                        tone={user.is_superuser ? "critical" : undefined}
                        variant={user.is_superuser ? "secondary" : "primary"}
                        onClick={() => toggleSuperuser(user)}
                        loading={saving === user.id}
                      >
                        {user.is_superuser ? "Remove Superuser" : "Make Superuser"}
                      </Button>
                    </div>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>

          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Role Permissions</Text>
                <Divider />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: "8px 4px", fontSize: 13 }}>
                  <Text variant="bodySm" fontWeight="semibold" tone="subdued">Feature</Text>
                  <div style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Seller</div>
                  <div style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Superuser</div>
                  {[
                    ["Dashboard", true],
                    ["Orders (own only)", true],
                    ["Products (own only)", true],
                    ["Products → Collections", false],
                    ["Customers (own only)", true],
                    ["Marketing", true],
                    ["Discounts", true],
                    ["Content → Media", true],
                    ["Content → Menus", false],
                    ["Content → Categories", false],
                    ["Content → Landing Page", false],
                    ["Content → Styles", false],
                    ["Content → Pages", false],
                    ["Content → Blog Posts", false],
                    ["Analytics", true],
                    ["Settings", true],
                    ["User Management", false],
                  ].map(([name, sellerAccess]) => (
                    <React.Fragment key={String(name)}>
                      <Text variant="bodySm">{String(name)}</Text>
                      <div style={{ textAlign: "center", color: sellerAccess ? "#10b981" : "#d1d5db" }}>{sellerAccess ? "✓" : "✗"}</div>
                      <div style={{ textAlign: "center", color: "#10b981" }}>✓</div>
                    </React.Fragment>
                  ))}
                </div>
              </BlockStack>
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
