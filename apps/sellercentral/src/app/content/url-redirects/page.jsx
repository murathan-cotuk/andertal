"use client";

import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

export default function ContentUrlRedirectsPage() {
  return (
    <DashboardLayout>
      <Page title="URL redirects">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="p" tone="subdued">
                  URL redirects let you redirect traffic from one URL to another. This page is a placeholder.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
