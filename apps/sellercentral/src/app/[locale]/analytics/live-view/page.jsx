"use client";

import DashboardLayout from "@/components/DashboardLayout";
import LiveVisitorsPanel from "@/components/dashboard/LiveVisitorsPanel";
import MinimalPage from "@/components/MinimalPage";
import { useEffect, useState } from "react";

export default function AnalyticsLiveView() {
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => {
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  if (!isSuperuser) {
    return (
      <DashboardLayout>
        <MinimalPage title="Live View" subtitle="Nur für Superuser verfügbar" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: "8px 4px 24px", maxWidth: 1100 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Live View</h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>
          Echtzeit-Aktivität im Shop — Besucher, IP und Standort
        </p>
        <LiveVisitorsPanel defaultExpanded />
      </div>
    </DashboardLayout>
  );
}
