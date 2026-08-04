"use client";

import { Suspense } from "react";
import { useAuthGuard } from "@andertal/lib";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import CaseInbox from "@/components/support/CaseInbox";

export default function NachrichtenPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f7f5f0" }}>
      <ShopHeader />
      <div style={{ flex: 1 }}>
        <Suspense fallback={<GlobalPageLoader />}>
          <CaseInbox />
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}
