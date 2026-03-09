"use client";

import DashboardLayout from "@/components/DashboardLayout";
import MinimalPage from "@/components/MinimalPage";

export default function AbandonedCheckouts() {
  return (
    <DashboardLayout>
      <MinimalPage title="Abandoned checkouts" subtitle="Recover abandoned carts" />
    </DashboardLayout>
  );
}
