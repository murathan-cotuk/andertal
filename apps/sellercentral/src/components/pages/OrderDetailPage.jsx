"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Banner,
  Box,
  Divider,
  InlineStack,
  Button,
} from "@shopify/polaris";
import { Link } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function formatEurFromCents(cents) {
  const n = Number(cents || 0) / 100;
  return `€${n.toFixed(2)}`;
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params?.id;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const client = getMedusaAdminClient();
        const data = await client.getOrder(id);
        const o = data?.order ?? data;
        if (!cancelled) {
          setOrder(o || null);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load order");
          setOrder(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const addr = order?.shipping_address;

  return (
    <Page
      backAction={{ content: "Orders", url: "/orders" }}
      title={order?.display_id ? `Order ${order.display_id}` : "Order"}
      subtitle={order?.metadata?.source === "belucha_store" ? "Shop checkout (Stripe)" : undefined}
    >
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
              {loading ? (
                <Text as="p" tone="subdued">
                  Loading…
                </Text>
              ) : !order ? (
                <Text as="p" tone="subdued">
                  Order not found.
                </Text>
              ) : (
                <>
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Status
                      </Text>
                      <Text as="p" fontWeight="semibold">
                        {order.status || "—"}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Total
                      </Text>
                      <Text as="p" fontWeight="semibold">
                        {formatEurFromCents(order.total ?? order.total_amount)}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Date
                      </Text>
                      <Text as="p" fontWeight="semibold">
                        {order.created_at
                          ? new Date(order.created_at).toLocaleString()
                          : "—"}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <Divider />
                  <Text as="h3" variant="headingSm">
                    Customer
                  </Text>
                  <Text as="p">
                    {order.email ||
                      order.customer?.email ||
                      "—"}
                  </Text>
                  {(order.customer?.first_name || order.customer?.last_name) && (
                    <Text as="p" tone="subdued">
                      {[order.customer?.first_name, order.customer?.last_name]
                        .filter(Boolean)
                        .join(" ")}
                      {order.customer?.phone
                        ? ` · ${order.customer.phone}`
                        : ""}
                    </Text>
                  )}
                  {addr && (addr.address_1 || addr.city) && (
                    <>
                      <Divider />
                      <Text as="h3" variant="headingSm">
                        Shipping address
                      </Text>
                      <Text as="p">
                        {[addr.address_1, addr.address_2, addr.postal_code, addr.city, addr.country]
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    </>
                  )}
                  {Array.isArray(order.items) && order.items.length > 0 && (
                    <>
                      <Divider />
                      <Text as="h3" variant="headingSm">
                        Line items
                      </Text>
                      <BlockStack gap="200">
                        {order.items.map((it) => (
                          <Box
                            key={it.id || `${it.product_id}-${it.title}`}
                            padding="300"
                            background="bg-surface-secondary"
                            borderRadius="200"
                          >
                            <InlineStack align="space-between" blockAlign="start" wrap>
                              <BlockStack gap="100">
                                <Text as="p" fontWeight="semibold">
                                  {it.title || "Item"}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Qty {it.quantity ?? 1}
                                  {it.product_id ? ` · ${it.product_id}` : ""}
                                </Text>
                              </BlockStack>
                              <Text as="p" fontWeight="semibold">
                                {formatEurFromCents(
                                  (it.unit_price_cents || 0) * (it.quantity || 1)
                                )}
                              </Text>
                            </InlineStack>
                          </Box>
                        ))}
                      </BlockStack>
                    </>
                  )}
                  {order.metadata?.payment_intent_id && (
                    <Box paddingBlockStart="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Payment intent: {order.metadata.payment_intent_id}
                      </Text>
                    </Box>
                  )}
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Link href="/orders">
            <Button>Back to orders</Button>
          </Link>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
