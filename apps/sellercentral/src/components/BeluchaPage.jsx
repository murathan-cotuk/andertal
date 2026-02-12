"use client";

import React from "react";
import { Page } from "@shopify/polaris";

/**
 * Shopify admin tarzı sayfa başlığı ve aksiyonlar için ortak wrapper.
 * İçeriği Polaris Layout + Card + Button vb. ile kullanın.
 */
export function BeluchaPage({
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  backAction,
  children,
  fullWidth,
  narrowWidth,
}) {
  return (
    <Page
      title={title}
      subtitle={subtitle}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      backAction={backAction}
      fullWidth={fullWidth}
      narrowWidth={narrowWidth}
    >
      {children}
    </Page>
  );
}
