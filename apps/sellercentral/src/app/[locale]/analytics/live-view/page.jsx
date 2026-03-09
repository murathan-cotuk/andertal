"use client";

import DashboardLayout from "@/components/DashboardLayout";
import MinimalPage from "@/components/MinimalPage";

export default function AnalyticsLiveView() {
  return (
    <DashboardLayout>
      <MinimalPage title="Live View" subtitle="Real-time store activity" />
    </DashboardLayout>
  );
}
