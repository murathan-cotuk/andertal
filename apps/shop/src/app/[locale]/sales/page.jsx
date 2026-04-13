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

const IntroText = styled.p`
  margin: 0;
  color: #6b7280;
  font-size: 14px;
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

function getProductBasePriceCents(product) {
  const firstVariantPrice = product?.variants?.[0]?.prices?.[0]?.amount;
  if (firstVariantPrice != null) return Number(firstVariantPrice) || 0;
  if (product?.price != null) return Math.round(Number(product.price) * 100) || 0;
  return 0;
}

function isDiscountedProduct(product) {
  const base = getProductBasePriceCents(product);
  const sale = product?.metadata?.rabattpreis_cents != null ? Number(product.metadata.rabattpreis_cents) : null;
  return sale != null && sale > 0 && sale < base;
}

function productPerfScore(product) {
  const meta = product?.metadata || {};
  const sold = Number(meta.sold_last_month || meta.sold || 0) || 0;
  const views = Number(meta.view_count || meta.views || 0) || 0;
  const reviewCount = Number(meta.review_count || 0) || 0;
  const reviewAvg = Number(meta.review_avg || 0) || 0;
  return sold * 1000 + views * 10 + reviewAvg * reviewCount * 5;
}

function productCategoryKeys(product) {
  const out = [];
  const collectionId = product?.collection?.id || product?.metadata?.collection_id || null;
  const collectionHandle = product?.collection?.handle || product?.metadata?.collection_handle || null;
  if (collectionId) out.push(`id:${String(collectionId)}`);
  if (collectionHandle) out.push(`handle:${String(collectionHandle).toLowerCase()}`);

  const ids = product?.metadata?.collection_ids;
  if (Array.isArray(ids)) {
    ids.forEach((id) => {
      if (id) out.push(`id:${String(id)}`);
    });
  }
  return [...new Set(out)];
}

export default function SalesPage() {
  const locale = useLocale();
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    if (locale === "de") return { title: "Sales", text: "Alle Kategorien mit reduzierten Produkten", seeAll: "Alle ansehen", empty: "Keine reduzierten Produkte gefunden." };
    if (locale === "tr") return { title: "Indirimler", text: "Indirimli urun bulunan tum kategoriler", seeAll: "Tumunu gor", empty: "Indirimli urun bulunamadi." };
    return { title: "Sales", text: "Categories with discounted products", seeAll: "See all", empty: "No discounted products found." };
  }, [locale]);

  const rows = useMemo(() => {
    const discounted = products.filter(isDiscountedProduct);
    if (!discounted.length) return [];

    const byCollection = new Map();
    const byKey = new Map();
    collections.forEach((c) => {
      if (c?.id) byKey.set(`id:${String(c.id)}`, c);
      if (c?.handle) byKey.set(`handle:${String(c.handle).toLowerCase()}`, c);
    });

    discounted.forEach((p) => {
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
        products: entry.products.sort((a, b) => productPerfScore(b) - productPerfScore(a)),
      }))
      .filter((entry) => entry.products.length > 0)
      .sort((a, b) => b.products.length - a.products.length);

    return list;
  }, [collections, products]);

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Intro>
          <IntroTitle className="shop-typo-catalog-title">{copy.title}</IntroTitle>
          <IntroText>{copy.text}</IntroText>
        </Intro>

        {loading ? <GlobalPageLoader /> : null}
        {error ? <p style={{ color: "#b91c1c", padding: "0 24px" }}>{error}</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <p style={{ color: "#6b7280", padding: "0 24px" }}>{copy.empty}</p>
        ) : null}

        {!loading && !error && rows.map(({ collection, products: list }) => (
          <Carousel
            key={collection.id || collection.handle}
            contained={false}
            navOnSides
            gap={16}
            visibleCount={5}
            ariaLabel={collection.title || collection.name || collection.handle || "Sales category"}
            header={(
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12, flexWrap: "wrap" }}>
                <h2 className="shop-typo-h2" style={{ margin: 0 }}>
                  {collection.title || collection.name || collection.handle}
                </h2>
                <SeeAll href={`/${collection.handle}?sale=1`}>{copy.seeAll} →</SeeAll>
              </div>
            )}
          >
            {list.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </Carousel>
        ))}
      </Main>
      <Footer />
    </PageWrap>
  );
}

