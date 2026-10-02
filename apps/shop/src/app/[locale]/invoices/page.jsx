"use client";

import { useAuthGuard } from "@andertal/lib";
import { useTranslations } from "next-intl";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";

const GRAY = "#5e574e";

export default function InvoicesPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const t = useTranslations("accountMisc");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#faf7f2" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title={t("invoicesTitle")}>
            <div style={{ background: "#fff", boxShadow: "0 0 0 1px rgba(29, 27, 24, 0.06)", borderRadius: 18, padding: 28 }}>
              <p style={{ color: GRAY, margin: 0, lineHeight: 1.6 }}>
                {t("invoicesSoon")}
              </p>
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
