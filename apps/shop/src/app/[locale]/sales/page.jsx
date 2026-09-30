"use client";

import CatalogHubRoute from "@/components/catalog/CatalogHubRoute";

export default function SalesPage() {
  return <CatalogHubRoute cmsSlug="sales" settingsKey="sales" mode="sale" fallbackTitle="Sale" />;
}
