"use client";

import DashboardLayout from "@/components/DashboardLayout";
import AddExistingProductPage from "@/components/pages/products/AddExistingProductPage";

export default function AddExistingRoute() {
  return (
    <DashboardLayout>
      <AddExistingProductPage />
    </DashboardLayout>
  );
}
