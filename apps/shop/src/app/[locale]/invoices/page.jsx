"use client";

import { useAuthGuard } from "@andertal/lib";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";

const GRAY = "#6b7280";

export default function InvoicesPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title="Rechnungsübersicht">
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 28 }}>
              <p style={{ color: GRAY, margin: 0, lineHeight: 1.6 }}>
                Rechnungsübersicht folgt. Sie können Rechnungen auch weiterhin bei jeder Bestellung unter „Meine Bestellungen“ drucken.
              </p>
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
