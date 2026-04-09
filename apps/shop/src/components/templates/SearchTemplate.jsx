"use client";

import React, { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import styled from "styled-components";
import { useTranslations } from "next-intl";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import Breadcrumbs from "@/components/Breadcrumbs";
import { ProductGrid } from "@/components/ProductGrid";

import { useMedusaProducts } from "@/hooks/useMedusa";

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 48px 24px;
`;

const CategoryTitle = styled.h1.attrs({ className: "shop-typo-catalog-title" })`
  margin: 0 0 8px 0;
`;

const TitleSub = styled.p`
  font-size: 16px;
  color: #6b7280;
  margin: 0 0 24px 0;
`;

export default function SearchTemplate() {
  const tCommon = useTranslations("common");
  const tHome = useTranslations("home");
  const searchParams = useSearchParams();
  const q = (searchParams?.get("q") || "").trim();

  const { products, loading, error } = useMedusaProducts();

  const filtered = useMemo(() => {
    if (!q || !Array.isArray(products)) return [];
    const needle = q.toLowerCase();
    return products.filter(
      (p) =>
        (p?.title || "").toLowerCase().includes(needle) ||
        (p?.description || "").toLowerCase().includes(needle)
    );
  }, [q, products]);

  const title = q ? `${tCommon("search")}: "${q}"` : tCommon("search");

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />

      <main className="flex-grow bg-white" aria-label="Search results">
        <Container>
          {loading && <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>{tHome("loading")}</div>}
          {error && (
            <div style={{ padding: "24px", backgroundColor: "#fef2f2", borderRadius: "8px", color: "#991b1b" }}>
              {tHome("error")}
            </div>
          )}
          {!loading && !error && (
            <>
              <div style={{ marginBottom: 12 }}>
                <Breadcrumbs title={title} />
              </div>
              <CategoryTitle>{title}</CategoryTitle>
              {q ? <TitleSub>{filtered.length} Ergebnisse</TitleSub> : null}
              <ProductGrid products={filtered} maxColumns={4} />
            </>
          )}
        </Container>
      </main>

      <Footer />
    </div>
  );
}
