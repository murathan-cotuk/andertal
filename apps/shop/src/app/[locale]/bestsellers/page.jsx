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
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";

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
  padding: 28px 24px 16px;

  @media (max-width: 767px) {
    padding: 20px 16px 12px;
  }
`;

const IntroTitle = styled.h1`
  margin: 0 0 6px;
`;

const IntroText = styled.p`
  margin: 0;
  color: #6b7280;
  font-size: 14px;
`;

const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px 20px;
  flex-wrap: wrap;

  @media (max-width: 767px) {
    padding: 0 16px 16px;
    gap: 6px;
  }
`;

const FilterChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1.5px solid ${(p) => (p.$active ? "#111827" : "#d1d5db")};
  background: ${(p) => (p.$active ? "#111827" : "#fff")};
  color: ${(p) => (p.$active ? "#fff" : "#374151")};
  font-size: 13px;
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s, color 0.15s;

  &:hover {
    border-color: #111827;
  }
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
`;

function productSalesScore(product) {
  const meta = product?.metadata || {};
  return Number(meta.sold_last_month || meta.sold || meta.sales_count || 0) || 0;
}

function isBestSellerProduct(product) {
  return productSalesScore(product) > 0 || product?.metadata?.is_bestseller === true;
}

function productCategoryKeys(product) {
  const out = [];
  const addCollection = (c) => {
    if (c?.id) out.push(`id:${String(c.id)}`);
    if (c?.handle) out.push(`handle:${String(c.handle).toLowerCase()}`);
  };
  if (product?.collection) addCollection(product.collection);
  if (Array.isArray(product?.collections)) product.collections.forEach(addCollection);
  if (product?.metadata?.collection_id) out.push(`id:${String(product.metadata.collection_id)}`);
  if (product?.metadata?.collection_handle) out.push(`handle:${String(product.metadata.collection_handle).toLowerCase()}`);
  const ids = product?.metadata?.collection_ids;
  if (Array.isArray(ids)) ids.forEach((id) => { if (id) out.push(`id:${String(id)}`); });
  return [...new Set(out)];
}

export default function BestsellersPage() {
  const locale = useLocale();
  const itemsPerRow = useResponsiveColumnCount(5, 2);
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCollections, setSelectedCollections] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const [colRes, prRes] = await Promise.all([
          fetch("/api/store-collections", { cache: "no-store" }),
          fetch("/api/store-products?limit=1200", { cache: "no-store" }),
        ]);
        const colData = colRes.ok ? await colRes.json() : { collections: [] };
        const prData = prRes.ok ? await prRes.json() : { products: [] };
        if (!cancelled) {
          setCollections(Array.isArray(colData?.collections) ? colData.collections : []);
          setProducts(Array.isArray(prData?.products) ? prData.products : []);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = useMemo(() => {
    if (locale === "de") return { title: "Bestsellers", text: "Meistverkaufte Produkte nach Kategorien", seeAll: "Alle ansehen", empty: "Keine Bestseller gefunden.", all: "Alle" };
    if (locale === "tr") return { title: "Cok Satanlar", text: "Kategorilere gore en cok satilan urunler", seeAll: "Tumunu gor", empty: "Cok satan urun bulunamadi.", all: "Tumu" };
    return { title: "Bestsellers", text: "Top-selling products by category", seeAll: "See all", empty: "No bestsellers found.", all: "All" };
  }, [locale]);

  const rows = useMemo(() => {
    const bestsellers = products.filter((p) => isBestSellerProduct(p));
    if (!bestsellers.length) return [];

    const byCollection = new Map();
    const byKey = new Map();
    collections.forEach((c) => {
      if (c?.id) byKey.set(`id:${String(c.id)}`, c);
      if (c?.handle) byKey.set(`handle:${String(c.handle).toLowerCase()}`, c);
    });

    bestsellers.forEach((p) => {
      const keys = productCategoryKeys(p);
      const key = keys.find((k) => byKey.has(k));
      if (!key) return;
      const c = byKey.get(key);
      if (!c?.handle) return;
      const mapKey = String(c.id || c.handle);
      if (!byCollection.has(mapKey)) byCollection.set(mapKey, { collection: c, products: [] });
      byCollection.get(mapKey).products.push(p);
    });

    const list = [...byCollection.values()]
      .map((entry) => ({
        collection: entry.collection,
        products: entry.products.sort((a, b) => productSalesScore(b) - productSalesScore(a)),
      }))
      .filter((entry) => entry.products.length > 0)
      .sort((a, b) => b.products.length - a.products.length);

    return list;
  }, [collections, products]);

  const filterCollections = useMemo(() => rows.map((r) => r.collection), [rows]);

  const visibleRows = useMemo(() => {
    if (selectedCollections.size === 0) return rows;
    return rows.filter((r) => selectedCollections.has(String(r.collection.id || r.collection.handle)));
  }, [rows, selectedCollections]);

  const toggleCollection = (key) => {
    setSelectedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Intro>
          <IntroTitle className="shop-typo-catalog-title">{copy.title}</IntroTitle>
          <IntroText>{copy.text}</IntroText>
        </Intro>

        {/* Horizontal category filter chips */}
        {!loading && !error && filterCollections.length > 0 && (
          <FilterBar>
            <FilterChip
              $active={selectedCollections.size === 0}
              onClick={() => setSelectedCollections(new Set())}
            >
              {copy.all}
            </FilterChip>
            {filterCollections.map((c) => {
              const key = String(c.id || c.handle);
              return (
                <FilterChip
                  key={key}
                  $active={selectedCollections.has(key)}
                  onClick={() => toggleCollection(key)}
                >
                  {c.title || c.name || c.handle}
                </FilterChip>
              );
            })}
          </FilterBar>
        )}

        {loading ? <GlobalPageLoader /> : null}
        {error ? <p style={{ color: "#b91c1c", padding: "0 24px" }}>{error}</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <p style={{ color: "#6b7280", padding: "0 24px" }}>{copy.empty}</p>
        ) : null}

        {!loading && !error && visibleRows.map(({ collection, products: list }) => (
          <div key={collection.id || collection.handle} style={{ padding: "8px 24px 28px" }}>
            <div style={{ width: "100%", maxWidth: 1280, boxSizing: "border-box", minWidth: 0, marginLeft: "auto", marginRight: "auto" }}>
              <Carousel
                contained={false}
                navOnSides
                gap={12}
                visibleCount={itemsPerRow}
                showFade={false}
                ariaLabel={collection.title || collection.name || collection.handle || "Bestsellers category"}
                header={(
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
                    <h2 className="shop-typo-h2" style={{ margin: 0 }}>
                      {collection.title || collection.name || collection.handle}
                    </h2>
                    <SeeAll href={`/${collection.handle}?bestseller=1`}>{copy.seeAll} →</SeeAll>
                  </div>
                )}
              >
                {list.map((p) => (
                  <ProductCard key={p.id} product={p} plainImage hideBestsellerBadge />
                ))}
              </Carousel>
            </div>
          </div>
        ))}
      </Main>
      <Footer />
    </PageWrap>
  );
}
