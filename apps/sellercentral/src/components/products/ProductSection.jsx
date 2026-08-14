"use client";

import React from "react";
import { Text, InlineStack } from "@shopify/polaris";

export const PRODUCT_SECTION_STYLES = `
  .product-edit-sections h2.Polaris-Text--root,
  .product-edit-sections .Polaris-Text--headingSm {
    font-size: 0.95rem !important;
    line-height: 1.3 !important;
    font-weight: 650 !important;
    letter-spacing: -0.01em;
    color: var(--p-color-text);
  }
  .product-edit-sections .product-section-heading-row {
    margin: 0 0 6px;
  }
  .product-section-rule {
    display: block;
    height: 0;
    border: 0;
    border-top: 1px solid #e5e7eb;
    margin: 14px 0 12px;
    box-shadow: none;
  }
  .product-edit-sections > .Polaris-BlockStack > .product-section-rule:first-child {
    margin-top: 4px;
  }
  .product-edit-sidebar .product-section-rule {
    margin: 12px 0 10px;
  }
  .product-edit-sidebar h2.Polaris-Text--root {
    font-size: 0.9rem !important;
    font-weight: 650 !important;
    margin-bottom: 4px;
  }
  .product-edit-header .product-edit-name {
    font-size: 0.95rem !important;
    font-weight: 700 !important;
  }
  .product-edit-sections .Polaris-Text--bodySm {
    font-size: 0.75rem !important;
  }
  .product-edit-compact .Polaris-Label,
  .product-edit-sections .Polaris-Label {
    font-size: 0.75rem !important;
  }
`;

export function ProductSectionRule() {
  return <div className="product-section-rule" role="separator" aria-hidden="true" />;
}

export function ProductSectionHeading({ children, badge }) {
  return (
    <InlineStack gap="200" blockAlign="center" wrap={false} className="product-section-heading-row">
      <Text as="h2" variant="headingMd" fontWeight="semibold">
        {children}
      </Text>
      {badge}
    </InlineStack>
  );
}
