"use client";

import DashboardLayout from "@/components/DashboardLayout";
import MinimalPage from "@/components/MinimalPage";

export default function Customers() {
  return (
    <DashboardLayout>
      <MinimalPage title="Customers" subtitle="Customer list and segments" />
    </DashboardLayout>
  );
}
