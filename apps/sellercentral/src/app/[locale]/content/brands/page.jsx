"use client";

import { Suspense } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import BrandPage from "@/components/pages/BrandPage";

export default function ContentBrands() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <BrandPage />
      </Suspense>
    </DashboardLayout>
  );
}
