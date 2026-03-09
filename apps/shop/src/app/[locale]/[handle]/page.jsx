"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useState, useEffect } from "react";
import { useParams, notFound } from "next/navigation";
import { getMedusaClient } from "@/lib/medusa-client";
import { tokens } from "@/design-system/tokens";
import styled from "styled-components";

const RESERVED_HANDLES = ["search", "login", "register", "account", "bestsellers", "recommended", "category", "pages", "collections", "produkt", "kollektion", "product"];

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s*on\w+=["'][^"']*["']/gi, "");
}

const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${tokens.background.main};
`;

const Main = styled.main`
  flex: 1;
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  padding: 0 ${tokens.containerPadding} ${tokens.sectionGap};
`;

const Banner = styled.div`
  width: 100%;
  margin-bottom: ${tokens.spacing.xl};
  border-radius: ${tokens.radius.card};
  overflow: hidden;
  background: ${tokens.background.soft};
  img {
    width: 100%;
    height: auto;
    max-height: 280px;
    object-fit: cover;
    display: block;
  }
`;

const Title = styled.h1`
  font-size: ${tokens.fontSize.h2};
  font-weight: 700;
  color: ${tokens.dark[900]};
  margin: 0 0 ${tokens.spacing.md};
  font-family: ${tokens.fontFamily.sans};
`;

const Description = styled.div`
  font-size: ${tokens.fontSize.body};
  line-height: ${tokens.lineHeight.relaxed};
  color: ${tokens.dark[600]};
  margin-top: ${tokens.spacing["2xl"]};
  margin-bottom: ${tokens.spacing.xl};
  max-width: 720px;
  & p { margin: 0 0 0.75em; }
  & p:last-child { margin-bottom: 0; }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${tokens.spacing.md};
  margin-bottom: ${tokens.spacing.lg};
`;

const SortSelect = styled.select`
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  border: 1px solid ${tokens.border.light};
  border-radius: ${tokens.radius.input};
  font-size: ${tokens.fontSize.small};
  font-family: ${tokens.fontFamily.sans};
  background: ${tokens.background.card};
  color: ${tokens.dark[800]};
`;

const EmptyState = styled.p`
  text-align: center;
  color: ${tokens.dark[500]};
  font-size: ${tokens.fontSize.body};
  padding: ${tokens.spacing["2xl"]} ${tokens.spacing.md};
  margin: 0;
`;

const ErrorBox = styled.div`
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: ${tokens.spacing.md};
  border-radius: ${tokens.radius.input};
  margin: ${tokens.spacing.xl} 0;
`;

const SORT_OPTIONS = [
  { value: "default", label: "Standard" },
  { value: "price_asc", label: "Preis aufsteigend" },
  { value: "price_desc", label: "Preis absteigend" },
  { value: "title_asc", label: "Name A–Z" },
  { value: "title_desc", label: "Name Z–A" },
];

const PER_PAGE = 24;

export default function CollectionByHandlePage() {
  const params = useParams();
  const locale = params?.locale ?? "en";
  const handle = params?.handle != null ? String(params.handle) : undefined;

  const [collection, setCollection] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    if (!handle) return;
    if (RESERVED_HANDLES.includes(handle.toLowerCase())) {
      setNotFoundState(true);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use the Next.js API route to avoid CORS issues with direct Medusa calls
        const colRes = await fetch(`/api/store-collections?handle=${encodeURIComponent(handle)}`);
        if (colRes.status === 404) {
          setNotFoundState(true);
          setCollection(null);
          setProducts([]);
          setLoading(false);
          return;
        }
        if (!colRes.ok) {
          throw new Error(`HTTP ${colRes.status}`);
        }
        const colData = await colRes.json();
        const col = colData?.collection ?? null;
        if (!col) {
          setNotFoundState(true);
          setCollection(null);
          setProducts([]);
          setLoading(false);
          return;
        }
        setCollection(col);

        const client = getMedusaClient();
        const productsRes = await client.getProducts({
          collection_id: col.id,
          limit: 200,
        });
        setProducts(productsRes?.products ?? []);
      } catch (err) {
        setError(err?.message ?? "Fehler beim Laden");
        setCollection(null);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [handle]);

  useEffect(() => {
    if (typeof document === "undefined" || !collection?.handle) return;
    const href = `${window.location.origin}/${locale}/${collection.handle}`;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [locale, collection?.handle]);

  const sortedProducts = [...(products || [])];
  if (sort === "price_asc") sortedProducts.sort((a, b) => (a.variants?.[0]?.prices?.[0]?.amount ?? 0) - (b.variants?.[0]?.prices?.[0]?.amount ?? 0));
  if (sort === "price_desc") sortedProducts.sort((a, b) => (b.variants?.[0]?.prices?.[0]?.amount ?? 0) - (a.variants?.[0]?.prices?.[0]?.amount ?? 0));
  if (sort === "title_asc") sortedProducts.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  if (sort === "title_desc") sortedProducts.sort((a, b) => (b.title || "").localeCompare(a.title || ""));

  const total = sortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PER_PAGE;
  const paginatedProducts = sortedProducts.slice(start, start + PER_PAGE);

  const displayTitle = collection?.display_title || collection?.title || "";

  if (notFoundState) notFound();

  if (loading) {
    return (
      <PageWrap>
        <ShopHeader />
        <Main>
          <p>Laden…</p>
        </Main>
        <Footer />
      </PageWrap>
    );
  }

  if (error || !collection) {
    return (
      <PageWrap>
        <ShopHeader />
        <Main>
          <ErrorBox>{error || "Kollektion nicht gefunden"}</ErrorBox>
        </Main>
        <Footer />
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Breadcrumbs items={[{ label: "Home", href: `/${locale}` }, { label: displayTitle || handle, href: null }]} />
        {collection.banner && (
          <Banner>
            <img src={collection.banner} alt="" />
          </Banner>
        )}
        <Title>{displayTitle}</Title>

        <Toolbar>
          <span style={{ fontSize: tokens.fontSize.small, color: tokens.dark[500] }}>
            {total} {total === 1 ? "Produkt" : "Produkte"}
          </span>
          <SortSelect value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sortierung">
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </SortSelect>
        </Toolbar>

        {paginatedProducts.length === 0 ? (
          <EmptyState>Noch keine Produkte in dieser Kollektion.</EmptyState>
        ) : (
          <>
            <ProductGrid products={paginatedProducts} />
            {totalPages > 1 && (
              <div style={{ marginTop: tokens.spacing.xl, display: "flex", justifyContent: "center", gap: tokens.spacing.sm, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  style={{
                    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                    border: `1px solid ${tokens.border.light}`,
                    borderRadius: tokens.radius.button,
                    background: tokens.background.card,
                    cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                    opacity: currentPage <= 1 ? 0.6 : 1,
                  }}
                >
                  Zurück
                </button>
                <span style={{ alignSelf: "center", fontSize: tokens.fontSize.small, color: tokens.dark[500] }}>
                  Seite {currentPage} von {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                    border: `1px solid ${tokens.border.light}`,
                    borderRadius: tokens.radius.button,
                    background: tokens.background.card,
                    cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                    opacity: currentPage >= totalPages ? 0.6 : 1,
                  }}
                >
                  Weiter
                </button>
              </div>
            )}
          </>
        )}

        {collection.description && (
          <Description
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(collection.description),
            }}
          />
        )}
      </Main>
      <Footer />
    </PageWrap>
  );
}
