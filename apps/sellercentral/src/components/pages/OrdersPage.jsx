"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Box,
  Banner,
  IndexTable,
  Badge,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const client = getMedusaAdminClient();
        const data = await client.getOrders();
        setOrders(data.orders || []);
        setError(null);
      } catch (err) {
        setError(err?.message || "Failed to load orders");
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const statusTone = (status) => {
    if (status === "completed") return "success";
    if (status === "pending") return "attention";
    if (status === "cancelled") return "critical";
    return "subdued";
  };

  return (
    <Page title="Orders" subtitle="Recent orders from your store">
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Recent orders
              </Text>
              {loading ? (
                <Box paddingBlock="400">
                  <Text as="p" tone="subdued">
                    Loading…
                  </Text>
                </Box>
              ) : orders.length === 0 ? (
                <Box paddingBlock="600">
                  <Text as="p" tone="subdued">
                    No orders yet. Orders will appear here when customers place orders.
                  </Text>
                </Box>
              ) : (
                <IndexTable
                  resourceName={{ singular: "order", plural: "orders" }}
                  itemCount={orders.length}
                  selectable={false}
                  headings={[
                    { title: "Order" },
                    { title: "Customer" },
                    { title: "Total" },
                    { title: "Status" },
                    { title: "Date" },
                  ]}
                >
                  {orders.map((order, index) => (
                    <IndexTable.Row id={order.id} key={order.id} position={index}>
                      <IndexTable.Cell>
                        <Link href={`/orders/${order.id}`} style={{ color: "var(--p-color-text-link)", fontWeight: 500 }}>
                          {order.display_id ?? order.id}
                        </Link>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {order.email ?? order.customer?.email ?? "—"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        €{typeof order.total === "number" ? order.total.toFixed(2) : (order.total ?? "0.00")}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={statusTone(order.status)}>{order.status || "pending"}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {order.created_at
                          ? new Date(order.created_at).toLocaleDateString()
                          : order.createdAt
                            ? new Date(order.createdAt).toLocaleDateString()
                            : "—"}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
