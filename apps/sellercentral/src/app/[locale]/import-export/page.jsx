"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

export default function ImportExport() {
  return (
    <DashboardLayout>
      <Page
        title="Import/Export"
        subtitle="Bulk product, price, stock, and media uploads; data exports"
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="p" tone="subdued">
                  Import products, prices, inventory, and images in bulk. Export orders and product data.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
