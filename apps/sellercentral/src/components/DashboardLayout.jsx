"use client";

import React from "react";
import PolarisLayout from "./PolarisLayout";

/**
 * Dashboard shell: Shopify Polaris Frame + Navigation + TopBar.
 * All dashboard pages use this; content is rendered inside Polaris Frame.
 */
export default function DashboardLayout({ children }) {
  return <PolarisLayout>{children}</PolarisLayout>;
}
