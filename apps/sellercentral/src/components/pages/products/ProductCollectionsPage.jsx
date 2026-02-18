"use client";

import React, { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Box,
  Banner,
  IndexTable,
  EmptyState,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function ProductCollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const client = getMedusaAdminClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await client.getMedusaCollections();
        const list = data?.collections || [];
        if (!cancelled) setCollections(Array.isArray(list) ? list : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load collections");
          setCollections([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Page title="Collections" subtitle="Product collections (including those created from categories)">
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
                Collections
              </Text>
              {loading ? (
                <Box paddingBlock="400">
                  <Text as="p" tone="subdued">
                    Loading…
                  </Text>
                </Box>
              ) : collections.length === 0 ? (
                <EmptyState
                  heading="No collections yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Collections appear here when you create them from Content → Categories by enabling &quot;Has collection&quot;, or when created in Medusa.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: "collection", plural: "collections" }}
                  itemCount={collections.length}
                  selectable={false}
                  headings={[{ title: "Title" }, { title: "Handle" }, { title: "ID" }]}
                >
                  {collections.map((col, index) => (
                    <IndexTable.Row id={col.id} key={col.id} position={index}>
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="medium">
                          {col.title ?? col.name ?? "—"}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" tone="subdued">
                          {col.handle ?? "—"}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {col.id}
                        </Text>
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
