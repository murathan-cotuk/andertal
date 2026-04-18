"use client";

import DashboardLayout from "@/components/DashboardLayout";
import ProductGroupsPage from "@/components/pages/products/ProductGroupsPage";

export default function ProductGroupsRoute() {
  return (
    <DashboardLayout>
      <ProductGroupsPage />
    </DashboardLayout>
  );
}
