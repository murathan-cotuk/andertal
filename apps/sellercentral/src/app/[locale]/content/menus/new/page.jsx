"use client";

import DashboardLayout from "@/components/DashboardLayout";
import ContentMenusPage from "@/components/pages/content/ContentMenusPage";

export default function ContentMenusNewPage() {
  return (
    <DashboardLayout>
      <ContentMenusPage panelMode="new" />
    </DashboardLayout>
  );
}
