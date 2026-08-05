"use client";

import { Suspense } from "react";
import { useAuthGuard } from "@andertal/lib";
import { useTranslations } from "next-intl";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import CaseInbox from "@/components/support/CaseInbox";

export default function NachrichtenPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const tMessages = useTranslations("pages.messages");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title={tMessages("title")}>
            <Suspense fallback={<GlobalPageLoader />}>
              <CaseInbox embedded />
            </Suspense>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
