"use client";

import React from "react";
import { Card, Text, BlockStack } from "@shopify/polaris";

export default function SettingsSubpage({ title, description }) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        <Text as="p" tone="subdued">
          {description || "Configure this section. Content will be added here."}
        </Text>
      </BlockStack>
    </Card>
  );
}
