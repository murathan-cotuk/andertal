"use client";

import CatalogHubRoute from "@/components/catalog/CatalogHubRoute";

export default function BestsellersPage() {
  return <CatalogHubRoute cmsSlug="bestsellers" settingsKey="bestsellers" mode="bestseller" fallbackTitle="Bestseller" />;
}
