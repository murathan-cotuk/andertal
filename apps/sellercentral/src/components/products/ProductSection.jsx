"use client";

import React from "react";
import { Text, InlineStack } from "@shopify/polaris";

export const PRODUCT_SECTION_STYLES = `
  .product-edit-sections h2.Polaris-Text--root,
  .product-edit-sections .Polaris-Text--headingSm {
    font-size: 1.2rem !important;
    line-height: 1.35 !important;
    font-weight: 650 !important;
    letter-spacing: -0.02em;
    color: var(--p-color-text);
  }
  .product-edit-sections .product-section-heading-row {
    margin: 2px 0 10px;
  }
  .product-section-rule {
    display: block;
    height: 0;
    border: 0;
    border-top: 1px solid #d1d5db;
    margin: 26px 0 22px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
  }
  .product-edit-sections > .Polaris-BlockStack > .product-section-rule:first-child {
    margin-top: 8px;
  }
  .product-edit-sidebar .product-section-rule {
    margin: 20px 0 18px;
  }
  .product-edit-sidebar h2.Polaris-Text--root {
    font-size: 1.05rem !important;
    font-weight: 650 !important;
    margin-bottom: 8px;
  }
  .product-edit-header .product-edit-name {
    font-size: 1.125rem !important;
    font-weight: 700 !important;
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
