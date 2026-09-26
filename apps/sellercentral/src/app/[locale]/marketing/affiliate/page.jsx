"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import AffiliateMarketingPage from "@/components/pages/marketing/AffiliateMarketingPage";
import MinimalPage from "@/components/MinimalPage";

export default function MarketingAffiliatePage() {
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => {
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  if (!isSuperuser) {
    return (
      <DashboardLayout>
        <MinimalPage title="Affiliate" subtitle="Nur für Superuser verfügbar" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <AffiliateMarketingPage />
    </DashboardLayout>
  );
}
