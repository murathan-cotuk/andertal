"use client";

import React from "react";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

/**
 * Shopify tarzı minimal sayfa: sadece başlık + kısa açıklama.
 */
export default function MinimalPage({ title, subtitle = "" }) {
  return (
    <Page title={title} subtitle={subtitle || undefined}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                This section is under development. Content will be added here.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
