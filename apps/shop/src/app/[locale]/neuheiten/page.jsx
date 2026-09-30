"use client";

import CatalogHubRoute from "@/components/catalog/CatalogHubRoute";

export default function NeuheitenPage() {
  return <CatalogHubRoute cmsSlug="new-in" mode="newest" fallbackTitle="Neuheiten" />;
}
