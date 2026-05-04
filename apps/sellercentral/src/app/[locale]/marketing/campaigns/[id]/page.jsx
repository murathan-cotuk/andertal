"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import MarketingPpcCampaignEditorPage from "@/components/pages/marketing/MarketingPpcCampaignEditorPage";

export default function MarketingCampaignDetailRoute() {
  const params = useParams();
  const id = params?.id;
  if (!id) return null;
  return (
    <DashboardLayout>
      <MarketingPpcCampaignEditorPage campaignId={String(id)} />
    </DashboardLayout>
  );
}
