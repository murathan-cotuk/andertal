"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import SeoHubPage from "@/components/pages/marketing/SeoHubPage";

export default function MarketingSeo() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("sellerIsSuperuser") === "true") {
      setAllowed(true);
    } else {
      router.replace("/marketing");
    }
  }, [router]);

  if (!allowed) return null;

  return (
    <DashboardLayout>
      <SeoHubPage />
    </DashboardLayout>
  );
}
