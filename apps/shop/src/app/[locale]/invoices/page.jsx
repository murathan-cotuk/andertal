"use client";

import { useAuthGuard, useCustomerAuth as useAuth } from "@belucha/lib";
import { useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout from "@/components/account/AccountPageLayout";

const GRAY = "#6b7280";
const DARK = "#1A1A1A";

export default function InvoicesPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1, padding: "40px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: DARK, margin: "0 0 24px" }}>Faturalar</h1>
          <AccountPageLayout>
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
