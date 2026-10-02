"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import { useTranslations } from "next-intl";

export default function RecommendedPage() {
  const t = useTranslations("accountMisc");
  return (
    <div className="min-h-screen flex flex-col">
      <ShopHeader />
      <main className="flex-grow">
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: "36px", fontWeight: 700, marginBottom: "16px", letterSpacing: "0.05em" }}>
            {t("recommendedTitle")}
          </h1>
          <p style={{ fontSize: "18px", color: "#5e574e", marginBottom: "32px" }}>
            {t("recommendedSubtitle")}
          </p>
        </div>
        <ProductGrid products={[]} />
      </main>
      <Footer />
    </div>
  );
}

