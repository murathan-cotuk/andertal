"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import styled from "styled-components";
import { getMedusaClient } from "@/lib/medusa-client";
import { ProductGrid } from "@/components/ProductGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Link } from "@/i18n/navigation";
import { resolveImageUrl, rewriteImageUrlsInHtml } from "@/lib/image-url";

const BannerWrapper = styled.div`
  width: 100%;
  margin-bottom: 0;
  flex-shrink: 0;
`;

const BannerImage = styled.img`
  width: 100%;
  max-height: 160px;
  min-height: 120px;
  object-fit: cover;
  display: block;
  vertical-align: middle;
`;

const ContentRow = styled.div`
  display: flex;
  width: 100%;
  margin: 0;
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

const CategoryDescription = styled.p`
  font-size: 16px;
  color: #6b7280;
  max-width: 800px;
  margin: 0;
`;

const LongContent = styled.div`
  max-width: 800px;
  margin: 0 0 32px 0;
  color: var(--body-color, #4b5563);
  line-height: var(--body-lh, 1.6);
  font-size: var(--body-fs, 1rem);
  font-family: var(--body-font);
  border: 1px solid #000;
  border-radius: 8px;
  padding: 24px;

  & h1 {
    font-family: var(--h1-ff);
    font-size: var(--h1-fs);
    font-weight: var(--h1-fw);
    font-style: var(--h1-style);
    color: var(--h1-color);
    letter-spacing: var(--h1-ls);
    line-height: var(--h1-lh);
    margin: 1.25em 0 0.5em;
  }
  & h2 {
    font-family: var(--h2-ff);
    font-size: var(--h2-fs);
    font-weight: var(--h2-fw);
    font-style: var(--h2-style);
    color: var(--h2-color);
    letter-spacing: var(--h2-ls);
    line-height: var(--h2-lh);
    margin: 1.25em 0 0.5em;
  }
  & h3 {
    font-family: var(--h3-ff);
    font-size: var(--h3-fs);
    font-weight: var(--h3-fw);
    font-style: var(--h3-style);
    color: var(--h3-color);
    letter-spacing: var(--h3-ls);
    line-height: var(--h3-lh);
    margin: 1em 0 0.4em;
  }
  & h4 {
    font-family: var(--h4-ff);
    font-size: var(--h4-fs);
    font-weight: var(--h4-fw);
    font-style: var(--h4-style);
    color: var(--h4-color);
    letter-spacing: var(--h4-ls);
    line-height: var(--h4-lh);
    margin: 0.85em 0 0.35em;
  }
  & h5 {
    font-family: var(--h5-ff);
    font-size: var(--h5-fs);
    font-weight: var(--h5-fw);
    font-style: var(--h5-style);
    color: var(--h5-color);
    letter-spacing: var(--h5-ls);
    line-height: var(--h5-lh);
    margin: 0.85em 0 0.35em;
  }
  & h6 {
    font-family: var(--h5-ff);
    font-size: var(--h5-fs);
    font-weight: var(--h5-fw);
    font-style: var(--h5-style);
    color: var(--h5-color);
    letter-spacing: var(--h5-ls);
    line-height: var(--h5-lh);
    margin: 0.85em 0 0.35em;
  }
  & h1:first-child,
  & h2:first-child,
  & h3:first-child,
  & h4:first-child,
  & h5:first-child,
  & h6:first-child {
    margin-top: 0;
  }
  & p { margin: 0 0 1em; }
  & p:last-child { margin-bottom: 0; }
  & ul, & ol { margin: 0.5em 0 1em 1.5em; padding-left: 1.5em; }
  & ul { list-style-type: disc; }
  & ol { list-style-type: decimal; }
  & li { margin-bottom: 0.35em; }
  & strong { font-weight: 600; color: #374151; }
  & em { font-style: italic; }
  & a { color: #0ea5e9; text-decoration: underline; }
  & a:hover { text-decoration: none; }
  & blockquote { margin: 1em 0; padding-left: 1em; border-left: 4px solid #e5e7eb; color: #6b7280; }
  & hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.25em 0; }
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 48px 24px;
`;

function flattenCategories(cats, out = []) {
  if (!Array.isArray(cats)) return out;
  for (const c of cats) {
    if (c && (c.slug || c.id)) out.push({ slug: c.slug || c.id, name: c.name || c.slug || "Category" });
    if (Array.isArray(c.children) && c.children.length) flattenCategories(c.children, out);
  }
  return out;
}

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\s*on\w+=["'][^"']*["']/gi, "");
}

export default function CategoryTemplate() {
  const params = useParams();
  const slug = params?.slug;
  const [category, setCategory] = useState(null);
  const [linkedCollection, setLinkedCollection] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        setLinkedCollection(null);
        const client = getMedusaClient();
        const [cat, prodRes, catRes] = await Promise.all([
          client.getCategoryBySlug(slug).catch(() => null),
          client.getProducts({ category: slug }),
          client.getCategories({ tree: true }).catch(() => ({ categories: [], tree: [] })),
        ]);
        setCategory(cat || null);
        setProducts(prodRes.products || []);
        const tree = catRes.tree || catRes.categories || [];
        setCategories(flattenCategories(Array.isArray(tree) ? tree : [tree]));
        if (cat?.collection_id) {
          const colRes = await fetch(`/api/store-collections?handle=${encodeURIComponent(cat.collection_id)}`);
          if (colRes.ok) {
            const colData = await colRes.json();
            if (colData?.collection) setLinkedCollection(colData.collection);
          }
        }
      } catch (err) {
        setError(err?.message || "Failed to load category");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <Container>
        <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>Loading category…</div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <div style={{ padding: "24px", backgroundColor: "#fef2f2", borderRadius: "8px", color: "#991b1b" }}>{error}</div>
      </Container>
    );
  }

  const title = category?.name || (slug ? `Category: ${slug}` : "Category");
  const rawBanner =
    linkedCollection?.banner ||
    linkedCollection?.banner_image_url ||
    linkedCollection?.image_url ||
    category?.banner_image_url ||
    category?.banner ||
    null;
  const bannerUrl = rawBanner ? resolveImageUrl(rawBanner) : null;
  const richtextHtml =
    linkedCollection?.description
      ? sanitizeHtml(rewriteImageUrlsInHtml(linkedCollection.description))
      : category?.long_content
        ? sanitizeHtml(rewriteImageUrlsInHtml(category.long_content))
        : "";

  return (
    <>
      {bannerUrl && (
        <BannerWrapper>
          <BannerImage src={bannerUrl} alt={title} />
        </BannerWrapper>
      )}
      <ContentRow>
        <FilterSidebar>
          <FilterTitle>Kategorien</FilterTitle>
          <FilterList>
            {categories.length === 0 ? (
              <li style={{ fontSize: 14, color: "#6b7280" }}>Keine Kategorien</li>
            ) : (
              categories.map((c) => (
                <FilterItem key={c.slug}>
                  <FilterLink href={"/category/" + c.slug} $active={c.slug === slug}>
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
            {category?.description && <CategoryDescription>{category.description}</CategoryDescription>}
          </CategoryHeader>
          <ProductGrid products={products} maxColumns={4} />
          {richtextHtml && (
            <LongContent dangerouslySetInnerHTML={{ __html: richtextHtml }} />
          )}
        </ContentColumn>
      </ContentRow>
    </>
  );
}
