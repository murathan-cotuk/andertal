"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import styled from "styled-components";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import Breadcrumbs from "@/components/Breadcrumbs";
import { ProductGrid } from "@/components/ProductGrid";

import { getMedusaClient } from "@/lib/medusa-client";
import { useMedusaProducts } from "@/hooks/useMedusa";

const ContentRow = styled.div`
  display: flex;
  width: 100%;
`;

const FilterSidebar = styled.aside`
  width: 260px;
  flex-shrink: 0;
  position: fixed;
  left: 0;
  top: 72px;
  bottom: 0;
  padding: 24px 20px 48px 24px;
  border-right: 1px solid #e5e7eb;
  background: #fafafa;
  overflow-y: auto;
  z-index: 10;
`;

const ContentColumn = styled.div`
  flex: 1;
  min-width: 0;
  padding: 20px 24px 48px 32px;
  margin-left: 260px;
`;

const FilterTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
`;

const FilterList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const FilterItem = styled.li`
  margin: 0;
  padding: 0;
`;

const FilterLink = styled(Link)`
  display: block;
  padding: 10px 12px;
  font-size: 15px;
  color: ${(p) => (p.$active ? "#111827" : "#4b5563")};
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  text-decoration: none;
  border-radius: 8px;
  background: ${(p) => (p.$active ? "#e5e7eb" : "transparent")};
  margin-bottom: 2px;
  &:hover {
    background: #e5e7eb;
    color: #111827;
  }
`;

const BreadcrumbWrap = styled.div`
  text-align: left;
  margin-bottom: 12px;
`;

const CategoryHeader = styled.div`
  text-align: left;
  margin-bottom: 20px;
  margin-top: 0;
`;

const CategoryTitle = styled.h1.attrs({ className: "shop-typo-catalog-title" })`
  margin: 0 0 8px 0;
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 48px 24px;
`;

const TitleSub = styled.p`
  font-size: 16px;
  color: #6b7280;
  margin: 0 0 24px 0;
`;

function flattenCategories(cats, out = []) {
  if (!Array.isArray(cats)) return out;
  for (const c of cats) {
    if (c && (c.slug || c.id)) {
      out.push({ slug: c.slug || c.id, name: c.name || c.slug || "Category" });
    }
    if (Array.isArray(c.children) && c.children.length) {
      flattenCategories(c.children, out);
    }
  }
  return out;
}

export default function SearchTemplate() {
  const tCommon = useTranslations("common");
  const tHome = useTranslations("home");
  const searchParams = useSearchParams();
  const q = (searchParams?.get("q") || "").trim();

  const { products, loading, error } = useMedusaProducts();

  const [categories, setCategories] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      try {
        const client = getMedusaClient();
        const catRes = await client.getCategories({ tree: true }).catch(() => null);
        const tree = catRes?.tree || catRes?.categories || [];
        const flat = flattenCategories(Array.isArray(tree) ? tree : [tree]);
        if (!cancelled) setCategories(flat);
      } catch {
        if (!cancelled) setCategories([]);
      }
    };
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!q || !Array.isArray(products)) return [];
    const needle = q.toLowerCase();
    return products.filter(
      (p) =>
        (p?.title || "").toLowerCase().includes(needle) ||
        (p?.description || "").toLowerCase().includes(needle)
    );
  }, [q, products]);

  const title = q ? `${tCommon("search")}: “${q}”` : tCommon("search");

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />

      <main className="flex-grow bg-white" aria-label="Search results">
        {(loading || error) && (
          <Container>
            {loading && <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>{tHome("loading")}</div>}
            {error && (
              <div
                style={{
                  padding: "24px",
                  backgroundColor: "#fef2f2",
                  borderRadius: "8px",
                  color: "#991b1b",
                }}
              >
                {tHome("error")}
              </div>
            )}
          </Container>
        )}

        {!loading && !error && (
          <ContentRow>
            <FilterSidebar>
              <FilterTitle>{tCommon("categories")}</FilterTitle>
              <FilterList>
                {categories.length === 0 ? (
                  <li style={{ fontSize: 14, color: "#6b7280" }}>—</li>
                ) : (
                  categories.map((c) => (
                    <FilterItem key={c.slug}>
                      <FilterLink href={`/category/${c.slug}`} $active={false}>
                        {c.name}
                      </FilterLink>
                    </FilterItem>
                  ))
                )}
              </FilterList>
            </FilterSidebar>

            <ContentColumn>
              <BreadcrumbWrap>
                <Breadcrumbs title={title} />
              </BreadcrumbWrap>

              <CategoryHeader>
                <CategoryTitle>{title}</CategoryTitle>
              </CategoryHeader>

              {q ? <TitleSub>{filtered.length}</TitleSub> : null}

              <ProductGrid products={filtered} maxColumns={4} />
            </ContentColumn>
          </ContentRow>
        )}
      </main>

      <Footer />
    </div>
  );
}

