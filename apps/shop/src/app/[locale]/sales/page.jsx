"use client";

import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import ShopHeader from "@/components/ShopHeader";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import Footer from "@/components/Footer";
import Carousel from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { isDiscountedProduct } from "@/lib/catalog-listing";
import { getLocalizedCategory } from "@/lib/format";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { storeCategoriesQuery } from "@/lib/store-categories-url";

const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fafafa;
`;

const Main = styled.main`
  flex: 1;
`;

const Intro = styled.section`
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  padding: 24px 24px 8px;

  @media (max-width: 767px) {
    padding: 20px 16px 6px;
  }
`;

const IntroTitle = styled.h1`
  margin: 0 0 8px;
`;

const SeeAll = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: #111827;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 8px 12px;
  white-space: nowrap;
`;

const MAX_ITEMS_PER_CAROUSEL = 10;

/** Walk category tree and build: categoryId → root category node */
function buildCategoryRootMap(nodes, root = null) {
  const map = new Map();
  for (const node of nodes || []) {
    if (!node) continue;
    const r = root ?? node;
    const id = String(node.id || "").trim();
    if (id) map.set(id, r);
    const childMap = buildCategoryRootMap(node.children || [], r);
    for (const [k, v] of childMap) map.set(k, v);
  }
  return map;
}

function productPerfScore(product) {
  const meta = product?.metadata || {};
  const sold = Number(meta.sold_last_month || meta.sold || 0) || 0;
  const views = Number(meta.view_count || meta.views || 0) || 0;
  const reviewCount = Number(meta.review_count || 0) || 0;
  const reviewAvg = Number(meta.review_avg || 0) || 0;
  return sold * 1000 + views * 10 + reviewAvg * reviewCount * 5;
}

const pageCopy = {
  de: { title: "Angebote", empty: "Keine reduzierten Produkte gefunden.", seeAll: "Alle ansehen" },
  tr: { title: "İndirimler", empty: "İndirimli ürün bulunamadı.", seeAll: "Tümünü gör" },
  fr: { title: "Promotions", empty: "Aucun produit en promotion.", seeAll: "Tout voir" },
  es: { title: "Ofertas", empty: "No se encontraron productos en oferta.", seeAll: "Ver todo" },
  it: { title: "Offerte", empty: "Nessun prodotto in offerta.", seeAll: "Vedi tutto" },
  en: { title: "Sales", empty: "No discounted products found.", seeAll: "See all" },
};

export default function SalesPage() {
  const locale = useLocale();
  const l = String(locale || "en").toLowerCase();
  const copy = pageCopy[l] || pageCopy.en;
  const itemsPerRow = useResponsiveColumnCount(5, 2);

  const [categoryTree, setCategoryTree] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const [catRes, prRes] = await Promise.all([
          fetch(`/api/store-categories${storeCategoriesQuery(locale, { tree: "true", is_visible: "true" })}`, { cache: "no-store" }),
          fetch("/api/store-products?limit=1200", { cache: "no-store" }),
        ]);
        const catData = catRes.ok ? await catRes.json() : { tree: [] };
        const prData = prRes.ok ? await prRes.json() : { products: [] };
        if (!cancelled) {
          setCategoryTree(Array.isArray(catData?.tree) ? catData.tree : []);
          setProducts(Array.isArray(prData?.products) ? prData.products : []);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [locale]);

  const rows = useMemo(() => {
    const discounted = products.filter(isDiscountedProduct);
    if (!discounted.length || !categoryTree.length) return [];

    // Only top-level (root) categories with products
    const rootCategories = categoryTree.filter((n) => n && n.has_products !== false);
    if (!rootCategories.length) return [];

    const catRootMap = buildCategoryRootMap(rootCategories);

    const byRoot = new Map(); // rootCategoryId → { category, products[] }
    for (const p of discounted) {
      const catId = String(p.metadata?.admin_category_id || p.metadata?.category_id || "").trim();
      if (!catId) continue;
      const root = catRootMap.get(catId);
      if (!root?.id) continue;
      const key = String(root.id);
      if (!byRoot.has(key)) byRoot.set(key, { category: root, products: [] });
      byRoot.get(key).products.push(p);
    }

    return [...byRoot.values()]
      .map(({ category, products: list }) => ({
        category,
        products: list
          .sort((a, b) => productPerfScore(b) - productPerfScore(a))
          .slice(0, MAX_ITEMS_PER_CAROUSEL),
      }))
      .filter((r) => r.products.length > 0)
      .sort((a, b) => b.products.length - a.products.length);
  }, [categoryTree, products]);

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Intro>
          <IntroTitle className="shop-typo-catalog-title">{copy.title}</IntroTitle>
        </Intro>

        {loading ? <GlobalPageLoader /> : null}
        {error ? <p style={{ color: "#b91c1c", padding: "0 24px" }}>{error}</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <p style={{ color: "#6b7280", padding: "0 24px" }}>{copy.empty}</p>
        ) : null}

        {!loading && !error && rows.map(({ category, products: list }) => {
          const catName = getLocalizedCategory(category, locale).name || category.name || category.slug || "";
          const catSlug = String(category.slug || category.handle || "").replace(/^\//, "");
          return (
            <div key={category.id} style={{ padding: "8px 24px 28px" }}>
              <div style={{ width: "100%", maxWidth: 1280, boxSizing: "border-box", minWidth: 0, marginLeft: "auto", marginRight: "auto" }}>
                <Carousel
                  contained={false}
                  navOnSides
                  gap={12}
                  visibleCount={itemsPerRow}
                  showFade={false}
                  ariaLabel={catName}
                  header={(
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
                      <h2 className="shop-typo-h2" style={{ margin: 0 }}>{catName}</h2>
                      {catSlug && (
                        <SeeAll href={`/${catSlug}?sale=1`}>{copy.seeAll} →</SeeAll>
                      )}
                    </div>
                  )}
                >
                  {list.map((p) => (
                    <ProductCard key={p.id} product={p} plainImage />
                  ))}
                </Carousel>
              </div>
            </div>
          );
        })}
      </Main>
      <Footer />
    </PageWrap>
  );
}
