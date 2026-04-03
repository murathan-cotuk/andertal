"use client";

import DashboardLayout from "@/components/DashboardLayout";
import ContentPagesPage from "@/components/pages/content/ContentPagesPage";

export default function ContentBlogPosts() {
  return (
    <DashboardLayout>
      <ContentPagesPage blogOnly />
    </DashboardLayout>
  );
}
