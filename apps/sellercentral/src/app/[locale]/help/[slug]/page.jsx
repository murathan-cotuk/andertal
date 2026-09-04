"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import HelpArticlePage from "@/components/pages/HelpArticlePage";

export default function HelpArticleRoute() {
  const params = useParams();
  const slug = params?.slug;

  return (
    <DashboardLayout>
      <HelpArticlePage slug={slug} />
    </DashboardLayout>
  );
}
